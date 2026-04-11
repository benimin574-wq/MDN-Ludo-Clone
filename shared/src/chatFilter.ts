export interface ChatFilterRule {
  label: string;
  pattern: RegExp;
}

// Neue Chatfilter-Regeln hier ergaenzen.
// Nutze bewusst Regex, damit auch getrennte Schreibweisen wie "f u c k" erkannt werden.
export const CHAT_FILTER_RULES: ChatFilterRule[] = [
  { label: "arsch", pattern: /a[\W_]*r[\W_]*s[\W_]*c[\W_]*h(?:[\W_]*l[\W_]*o[\W_]*c[\W_]*h)?/giu },
  { label: "bastard", pattern: /b[\W_]*a[\W_]*s[\W_]*t[\W_]*a[\W_]*r[\W_]*d/giu },
  { label: "depp", pattern: /d[\W_]*e[\W_]*p[\W_]*p/giu },
  { label: "dummkopf", pattern: /d[\W_]*u[\W_]*m[\W_]*m[\W_]*k[\W_]*o[\W_]*p[\W_]*f/giu },
  { label: "hurensohn", pattern: /h[\W_]*u[\W_]*r[\W_]*e[\W_]*n[\W_]*s[\W_]*o[\W_]*h[\W_]*n/giu },
  { label: "idiot", pattern: /i[\W_]*d[\W_]*i[\W_]*o[\W_]*t/giu },
  { label: "kacke", pattern: /k[\W_]*a[\W_]*c[\W_]*k[\W_]*e/giu },
  { label: "scheisse", pattern: /s[\W_]*c[\W_]*h[\W_]*e[\W_]*i[\W_]*(?:s|ß)[\W_]*e/giu },
  { label: "spast", pattern: /s[\W_]*p[\W_]*a[\W_]*s[\W_]*t/giu },
  { label: "wichser", pattern: /w[\W_]*i[\W_]*c[\W_]*h[\W_]*s[\W_]*e[\W_]*r/giu },
  { label: "fuck", pattern: /f[\W_]*[uüv][\W_]*c[\W_]*k/giu },
  { label: "shit", pattern: /s[\W_]*h[\W_]*[i1!|][\W_]*t/giu },
  { label: "n-word-a", pattern: /n[\W_]*[i1!|][\W_]*[gq9][\W_]*[gq9][\W_]*a/giu },
  { label: "n-word-er", pattern: /n[\W_]*[i1!|][\W_]*[gq9][\W_]*[gq9][\W_]*e[\W_]*r/giu },
  { label: "neger", pattern: /n[\W_]*e[\W_]*g[\W_]*e[\W_]*r/giu },

  { label: "opfer", pattern: /o[\W_]*p[\W_]*f[\W_]*e[\W_]*r/giu },
  { label: "loser", pattern: /l[\W_]*o[\W_]*s[\W_]*e[\W_]*r/giu },
  { label: "penner", pattern: /p[\W_]*e[\W_]*n[\W_]*n[\W_]*e[\W_]*r/giu },
  { label: "mongo", pattern: /m[\W_]*o[\W_]*n[\W_]*g[\W_]*o/giu },
  { label: "missgeburt", pattern: /m[\W_]*[i1!|][\W_]*s[\W_]*s[\W_]*g[\W_]*e[\W_]*b[\W_]*[uü][\W_]*r[\W_]*t/giu },
  { label: "fotze", pattern: /f[\W_]*o[\W_]*t[\W_]*z[\W_]*e/giu },
  { label: "schlampe", pattern: /s[\W_]*c[\W_]*h[\W_]*l[\W_]*a[\W_]*m[\W_]*p[\W_]*e/giu },
  { label: "nutte", pattern: /n[\W_]*[uü][\W_]*t[\W_]*t[\W_]*e/giu },
  { label: "hure", pattern: /h[\W_]*[uü][\W_]*r[\W_]*e/giu },
  { label: "fresse", pattern: /f[\W_]*r[\W_]*e[\W_]*s[\W_]*s[\W_]*e/giu },
  { label: "schwuchtel", pattern: /s[\W_]*c[\W_]*h[\W_]*w[\W_]*[uü][\W_]*c[\W_]*h[\W_]*t[\W_]*e[\W_]*l/giu },
  { label: "kanake", pattern: /k[\W_]*a[\W_]*n[\W_]*a[\W_]*k[\W_]*e/giu },
  { label: "bitch", pattern: /b[\W_]*[i1!|][\W_]*t[\W_]*c[\W_]*h/giu },
  { label: "cunt", pattern: /c[\W_]*[uü][\W_]*n[\W_]*t/giu },
  { label: "motherfucker", pattern: /m[\W_]*o[\W_]*t[\W_]*h[\W_]*e[\W_]*r[\W_]*f[\W_]*[uüv][\W_]*c[\W_]*k[\W_]*e[\W_]*r/giu },
  { label: "pussy", pattern: /p[\W_]*[uü][\W_]*s[\W_]*s[\W_]*y/giu },
  { label: "dick", pattern: /d[\W_]*[i1!|][\W_]*c[\W_]*k/giu },
  { label: "cock", pattern: /c[\W_]*o[\W_]*c[\W_]*k/giu },
  { label: "retard", pattern: /r[\W_]*e[\W_]*t[\W_]*a[\W_]*r[\W_]*d/giu },
  { label: "faggot", pattern: /f[\W_]*a[\W_]*g[\W_]*g[\W_]*o[\W_]*t/giu },
  { label: "verpiss dich", pattern: /v[\W_]*e[\W_]*r[\W_]*p[\W_]*[i1!|][\W_]*s[\W_]*s[\W_]*d[\W_]*[i1!|][\W_]*c[\W_]*h/giu },
  { label: "leck mich", pattern: /l[\W_]*e[\W_]*c[\W_]*k[\W_]*m[\W_]*[i1!|][\W_]*c[\W_]*h/giu },
];

export function filterChatText(value: string): string {
  return CHAT_FILTER_RULES.reduce((text, rule) => text.replace(rule.pattern, "***"), value);
}