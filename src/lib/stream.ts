export class StreamingTicker {
  private timer: any | null = null
  private intervalMs: number
  private onTick: () => void
  constructor(intervalMs: number, onTick: () => void) {
    this.intervalMs = intervalMs
    this.onTick = onTick
  }
  start() {
    if (this.timer) return
    this.timer = setInterval(this.onTick, this.intervalMs)
  }
  stop() {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }
}
