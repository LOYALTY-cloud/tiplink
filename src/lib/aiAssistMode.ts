export function isAIAssistMode() {
  if (typeof window === "undefined") return false
  return localStorage.getItem("admin_ai_assist") === "true"
}

export function setAIAssistMode(value: boolean) {
  localStorage.setItem("admin_ai_assist", value ? "true" : "false")
  window.dispatchEvent(new Event("aiAssistModeChange"))
}
