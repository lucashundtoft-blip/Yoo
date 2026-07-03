import { useEffect, useRef, useState } from 'react';
import { fetchVoiceStatus, sendVoiceQuery } from '../api';
import type { ScreenResult, VoiceAction, VoiceFilters } from '../types';

// The Web Speech API types aren't in TS's lib.dom yet; keep this minimal
// and cast at the boundary rather than dragging `any` through the component.
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Status = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface Props {
  filters: VoiceFilters;
  results: ScreenResult[];
  onActions: (actions: VoiceAction[]) => void;
}

export default function VoiceControl({ filters, results, onActions }: Props) {
  const [supported, setSupported] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Filters/results change on every render; keep the latest in a ref so the
  // recognizer's onresult callback (bound once) always reads current state.
  const latest = useRef({ filters, results });
  latest.current = { filters, results };

  useEffect(() => {
    const Recognition = getSpeechRecognition();
    setSupported(!!Recognition);
    fetchVoiceStatus().then((s) => setConfigured(s.configured));
  }, []);

  async function handleFinalTranscript(text: string) {
    setStatus('thinking');
    setError(null);
    try {
      const { filters: f, results: r } = latest.current;
      const res = await sendVoiceQuery(text, f, r);
      setReply(res.reply);
      onActions(res.actions);
      speak(res.reply);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Voice request failed';
      setError(message);
      setStatus('error');
    }
  }

  function speak(text: string) {
    if (!('speechSynthesis' in window)) {
      setStatus('idle');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setStatus('idle');
    utterance.onerror = () => setStatus('idle');
    setStatus('speaking');
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function toggleListening() {
    if (status === 'listening') {
      recognitionRef.current?.stop();
      return;
    }

    const Recognition = getSpeechRecognition();
    if (!Recognition) return;

    window.speechSynthesis?.cancel();
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      setTranscript(text);
      if (event.results[event.results.length - 1].isFinal) {
        handleFinalTranscript(text.trim());
      }
    };
    recognition.onerror = (event: any) => {
      setError(event.error === 'not-allowed' ? 'Microphone access was denied.' : `Speech recognition error: ${event.error}`);
      setStatus('error');
    };
    recognition.onend = () => {
      setStatus((s) => (s === 'listening' ? 'idle' : s));
    };

    recognitionRef.current = recognition;
    setTranscript('');
    setReply('');
    setError(null);
    setStatus('listening');
    recognition.start();
  }

  if (!supported) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
        Voice control needs a browser with Web Speech API support (Chrome or Edge).
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleListening}
          disabled={status === 'thinking' || configured === false}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg transition disabled:cursor-not-allowed disabled:opacity-40 ${
            status === 'listening'
              ? 'bg-rose-600 text-white animate-pulse'
              : 'bg-emerald-600 text-white hover:bg-emerald-500'
          }`}
          title={configured === false ? 'Voice assistant not configured on the backend' : 'Talk to the screener'}
        >
          {status === 'listening' ? '●' : '🎤'}
        </button>

        <div className="min-w-0 flex-1">
          {configured === false && (
            <p className="text-sm text-amber-400">
              Voice assistant not configured — set ANTHROPIC_API_KEY in backend/.env and restart the backend.
            </p>
          )}
          {configured !== false && (
            <>
              <p className="truncate text-sm text-slate-200">
                {status === 'idle' && !reply && 'Tap the mic and ask about the screener.'}
                {status === 'listening' && (transcript || 'Listening…')}
                {status === 'thinking' && 'Thinking…'}
                {status === 'speaking' && reply}
                {status === 'error' && (error ?? 'Something went wrong.')}
                {status === 'idle' && reply}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Try: "switch to my watchlist and run it", "only show bullish setups", "pull up
                Nvidia's chart"
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
