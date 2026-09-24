import AVFoundation

/// Spoken cues. Ducks whatever else is playing (podcast/music), then hands
/// audio focus back. Ported from RunCoach's VoiceCoach, plus picking the
/// best-quality installed English voice instead of the plain default.
/// Lines that Olaf's server pre-made in his own voice play from those clips;
/// everything else uses on-device speech.
final class VoiceCoach: NSObject, AVSpeechSynthesizerDelegate, AVAudioPlayerDelegate {
  private let synth = AVSpeechSynthesizer()
  private lazy var preferredVoice: AVSpeechSynthesisVoice? = Self.bestEnglishVoice()
  private var clips: [String: URL] = [:] // spoken text -> downloaded clip
  private var pending: Set<String> = []
  private var player: AVAudioPlayer?

  override init() {
    super.init()
    synth.delegate = self
  }

  /// Download server clips (text -> "/v1/voice/audio/<id>.wav"). The server
  /// may still be making them, so each request waits up to 10 minutes; a line
  /// spoken before its clip arrives just uses on-device speech.
  func prefetch(_ lines: [String: String], baseUrl: String?, token: String?) {
    guard let baseUrl, let token else { return }
    for (text, path) in lines where clips[text] == nil && !pending.contains(text) {
      guard let url = URL(string: baseUrl + path) else { continue }
      pending.insert(text)
      var request = URLRequest(url: url, timeoutInterval: 600)
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
      URLSession.shared.downloadTask(with: request) { [weak self] tmp, response, _ in
        var file: URL?
        if let tmp, (response as? HTTPURLResponse)?.statusCode == 200 {
          let dest = FileManager.default.temporaryDirectory.appendingPathComponent(url.lastPathComponent)
          try? FileManager.default.removeItem(at: dest)
          if (try? FileManager.default.moveItem(at: tmp, to: dest)) != nil { file = dest }
        }
        DispatchQueue.main.async {
          self?.pending.remove(text)
          if let file { self?.clips[text] = file }
        }
      }.resume()
    }
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
    if let file = clips[text], let clip = try? AVAudioPlayer(contentsOf: file) {
      player?.stop()
      player = clip
      clip.delegate = self
      clip.play()
      return
    }
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

  func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    deactivateIfIdle(synth)
  }

  private func deactivateIfIdle(_ synthesizer: AVSpeechSynthesizer) {
    if !synthesizer.isSpeaking && player?.isPlaying != true {
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
