import Foundation
import HealthKit

enum HealthKitServiceError: LocalizedError {
    case unavailable
    case authorizationFailed

    var errorDescription: String? {
        switch self {
        case .unavailable:
            return "Apple Health is unavailable on this device."
        case .authorizationFailed:
            return "Apple Health authorization could not be completed."
        }
    }
}

final class HealthKitService {
    private let store = HKHealthStore()
    private let calendar = Calendar.autoupdatingCurrent

    private var stepType: HKQuantityType? { HKQuantityType.quantityType(forIdentifier: .stepCount) }
    private var activeEnergyType: HKQuantityType? { HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) }
    private var exerciseTimeType: HKQuantityType? { HKQuantityType.quantityType(forIdentifier: .appleExerciseTime) }
    private var restingHeartRateType: HKQuantityType? { HKQuantityType.quantityType(forIdentifier: .restingHeartRate) }
    private var heartRateVariabilityType: HKQuantityType? { HKQuantityType.quantityType(forIdentifier: .heartRateVariabilitySDNN) }
    private var bodyMassType: HKQuantityType? { HKQuantityType.quantityType(forIdentifier: .bodyMass) }
    private var sleepType: HKCategoryType? { HKObjectType.categoryType(forIdentifier: .sleepAnalysis) }

    func sync(days: Int, completion: @escaping (Result<AppleHealthSnapshotPayload, Error>) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(.failure(HealthKitServiceError.unavailable))
            return
        }
        let readTypes = Set<HKObjectType>([
            stepType,
            activeEnergyType,
            exerciseTimeType,
            restingHeartRateType,
            heartRateVariabilityType,
            bodyMassType,
            sleepType,
        ].compactMap { $0 })
        store.requestAuthorization(toShare: nil, read: readTypes) { [weak self] success, error in
            guard let self else { return }
            guard success, error == nil else {
                completion(.failure(error ?? HealthKitServiceError.authorizationFailed))
                return
            }
            self.fetchSnapshot(days: days, completion: completion)
        }
    }

    private func fetchSnapshot(days: Int, completion: @escaping (Result<AppleHealthSnapshotPayload, Error>) -> Void) {
        let end = Date()
        let start = calendar.date(byAdding: .day, value: -(max(7, min(days, 365)) - 1), to: calendar.startOfDay(for: end))!
        let group = DispatchGroup()
        var firstError: Error?
        var steps: [String: Double] = [:]
        var activeEnergy: [String: Double] = [:]
        var exerciseMinutes: [String: Double] = [:]
        var restingHeartRate: [String: Double] = [:]
        var heartRateVariability: [String: Double] = [:]
        var sleepMinutes: [String: Double] = [:]
        var weights: [String: Double] = [:]
        let errorLock = NSLock()

        func capture(_ error: Error?) {
            errorLock.lock()
            defer { errorLock.unlock() }
            if firstError == nil, let error {
                firstError = error
            }
        }

        if let type = stepType {
            group.enter()
            fetchStatistics(type: type, options: .cumulativeSum, unit: .count(), start: start, end: end) {
                steps = $0
                capture($1)
                group.leave()
            }
        }
        if let type = activeEnergyType {
            group.enter()
            fetchStatistics(type: type, options: .cumulativeSum, unit: .kilocalorie(), start: start, end: end) {
                activeEnergy = $0
                capture($1)
                group.leave()
            }
        }
        if let type = exerciseTimeType {
            group.enter()
            fetchStatistics(type: type, options: .cumulativeSum, unit: .minute(), start: start, end: end) {
                exerciseMinutes = $0
                capture($1)
                group.leave()
            }
        }
        if let type = restingHeartRateType {
            group.enter()
            let unit = HKUnit.count().unitDivided(by: .minute())
            fetchStatistics(type: type, options: .discreteAverage, unit: unit, start: start, end: end) {
                restingHeartRate = $0
                capture($1)
                group.leave()
            }
        }
        if let type = heartRateVariabilityType {
            group.enter()
            fetchStatistics(type: type, options: .discreteAverage, unit: .secondUnit(with: .milli), start: start, end: end) {
                heartRateVariability = $0
                capture($1)
                group.leave()
            }
        }
        if let type = sleepType {
            group.enter()
            fetchSleep(type: type, start: start, end: end) {
                sleepMinutes = $0
                capture($1)
                group.leave()
            }
        }
        if let type = bodyMassType {
            group.enter()
            fetchWeights(type: type, start: start, end: end) {
                weights = $0
                capture($1)
                group.leave()
            }
        }

        group.notify(queue: .global(qos: .userInitiated)) { [calendar] in
            if let firstError {
                completion(.failure(firstError))
                return
            }
            let dayKeys = Set(steps.keys)
                .union(activeEnergy.keys)
                .union(exerciseMinutes.keys)
                .union(restingHeartRate.keys)
                .union(heartRateVariability.keys)
                .union(sleepMinutes.keys)
            let payloadDays = dayKeys.sorted().map { key in
                HealthDayPayload(
                    date: key,
                    steps: steps[key],
                    activeEnergyKcal: activeEnergy[key],
                    exerciseMinutes: exerciseMinutes[key],
                    restingHeartRate: restingHeartRate[key],
                    heartRateVariabilityMs: heartRateVariability[key],
                    sleepMinutes: sleepMinutes[key]
                )
            }
            let payloadWeights = weights.keys.sorted().compactMap { key in
                weights[key].map { HealthWeightPayload(date: key, weightKg: $0) }
            }
            let now = Date()
            let payload = AppleHealthSnapshotPayload(
                schemaVersion: 1,
                generatedAt: ISO8601DateFormatter().string(from: now),
                rangeStart: Self.dateKey(start, calendar: calendar),
                rangeEnd: Self.dateKey(end, calendar: calendar),
                days: payloadDays,
                bodyWeights: payloadWeights
            )
            completion(.success(payload))
        }
    }

    private func fetchStatistics(
        type: HKQuantityType,
        options: HKStatisticsOptions,
        unit: HKUnit,
        start: Date,
        end: Date,
        completion: @escaping ([String: Double], Error?) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        var interval = DateComponents()
        interval.day = 1
        let query = HKStatisticsCollectionQuery(
            quantityType: type,
            quantitySamplePredicate: predicate,
            options: options,
            anchorDate: calendar.startOfDay(for: start),
            intervalComponents: interval
        )
        query.initialResultsHandler = { [calendar] _, collection, error in
            guard let collection else {
                completion([:], error)
                return
            }
            var values: [String: Double] = [:]
            collection.enumerateStatistics(from: start, to: end) { statistics, _ in
                let quantity = options.contains(.cumulativeSum)
                    ? statistics.sumQuantity()
                    : statistics.averageQuantity()
                if let quantity {
                    values[Self.dateKey(statistics.startDate, calendar: calendar)] = quantity.doubleValue(for: unit)
                }
            }
            completion(values, error)
        }
        store.execute(query)
    }

    private func fetchWeights(
        type: HKQuantityType,
        start: Date,
        end: Date,
        completion: @escaping ([String: Double], Error?) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: true)
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { [calendar] _, samples, error in
            var values: [String: Double] = [:]
            for sample in samples as? [HKQuantitySample] ?? [] {
                values[Self.dateKey(sample.endDate, calendar: calendar)] = sample.quantity.doubleValue(for: .gramUnit(with: .kilo))
            }
            completion(values, error)
        }
        store.execute(query)
    }

    private func fetchSleep(
        type: HKCategoryType,
        start: Date,
        end: Date,
        completion: @escaping ([String: Double], Error?) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let resultsHandler: (HKSampleQuery, [HKSample]?, Error?) -> Void = { [calendar] _, samples, error in
            let categorySamples = samples as? [HKCategorySample] ?? []
            let totals = Self.sleepTotals(from: categorySamples, calendar: calendar)
            completion(totals, error)
        }
        let query = HKSampleQuery(
            sampleType: type,
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: nil,
            resultsHandler: resultsHandler
        )
        store.execute(query)
    }

    private static func sleepTotals(
        from samples: [HKCategorySample],
        calendar: Calendar
    ) -> [String: Double] {
        let asleepValues = Set(HKCategoryValueSleepAnalysis.allAsleepValues.map(\.rawValue))
        var intervalsByDayAndSource: [String: [String: [DateInterval]]] = [:]

        for sample in samples where asleepValues.contains(sample.value) {
            let day = dateKey(sample.endDate, calendar: calendar)
            let source = sample.sourceRevision.source.bundleIdentifier
            let interval = DateInterval(start: sample.startDate, end: sample.endDate)
            intervalsByDayAndSource[day, default: [:]][source, default: []].append(interval)
        }

        var totals: [String: Double] = [:]
        for (day, bySource) in intervalsByDayAndSource {
            let best = bySource.values
                .map(mergedDuration)
                .filter { $0 > 0 && $0 <= 16 * 60 * 60 }
                .max() ?? 0
            if best > 0 {
                totals[day] = best / 60
            }
        }
        return totals
    }

    private static func mergedDuration(_ intervals: [DateInterval]) -> TimeInterval {
        let sorted = intervals.sorted { $0.start < $1.start }
        guard var current = sorted.first else { return 0 }
        var total: TimeInterval = 0
        for interval in sorted.dropFirst() {
            if interval.start <= current.end {
                current = DateInterval(start: current.start, end: max(current.end, interval.end))
            } else {
                total += current.duration
                current = interval
            }
        }
        return total + current.duration
    }

    private static func dateKey(_ date: Date, calendar: Calendar) -> String {
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(
            format: "%04d-%02d-%02d",
            components.year ?? 0,
            components.month ?? 0,
            components.day ?? 0
        )
    }
}
