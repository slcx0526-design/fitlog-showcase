import Foundation

struct HealthDayPayload: Codable {
    let date: String
    let steps: Double?
    let activeEnergyKcal: Double?
    let exerciseMinutes: Double?
    let restingHeartRate: Double?
    let heartRateVariabilityMs: Double?
    let sleepMinutes: Double?
}

struct HealthWeightPayload: Codable {
    let date: String
    let weightKg: Double
}

struct AppleHealthSnapshotPayload: Codable {
    let schemaVersion: Int
    let generatedAt: String
    let rangeStart: String
    let rangeEnd: String
    let days: [HealthDayPayload]
    let bodyWeights: [HealthWeightPayload]
}
