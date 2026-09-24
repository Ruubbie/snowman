import AVFoundation

/// Spoken cues. Ducks whatever else is playing (podcast/music), then hands
/// audio focus back. Ported from RunCoach's VoiceCoach, plus picking the
/// best-quality installed English voice instead of the plain default.
final class VoiceCoach: NSObject, AVSpeechSynthesizerDelegate {
  private let synth = AVSpeechSynthesizer()
  private lazy var preferredVoice: AVSpeechSynthesisVoice? = Self.bestEnglishVoice()

  override init() {
    super.init()
    synth.delegate = self
  }

  func say(_ text: String) {
    guard !text.isEmpty else { return }
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(
      .playback,
      mode: .voicePrompt,
      options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers]
    )
    try? session.setActive(true)
    let utterance = AVSpeechUtterance(string: text)
    utterance.voice = preferredVoice ?? AVSpeechSynthesisVoice(language: "en-US")
    utterance.rate = 0.5
    synth.speak(utterance)
  }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
    deactivateIfIdle(synthesizer)
  }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
    deactivateIfIdle(synthesizer)
  }

  private func deactivateIfIdle(_ synthesizer: AVSpeechSynthesizer) {
    if !synthesizer.isSpeaking {
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
  }

  /// Prefer a premium voice, then enhanced, then whatever en-US default is
  /// installed. Premium/enhanced voices must be downloaded by the user under
  /// Settings > Accessibility > Spoken Content - if none are, this quietly
  /// falls back to the always-available default voice.
  private static func bestEnglishVoice() -> AVSpeechSynthesisVoice? {
    let englishVoices = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("en") }
    if let premium = englishVoices.first(where: { $0.quality == .premium }) { return premium }
    if let enhanced = englishVoices.first(where: { $0.quality == .enhanced }) { return enhanced }
    return englishVoices.first(where: { $0.language == "en-US" }) ?? AVSpeechSynthesisVoice(language: "en-US")
  }
}
