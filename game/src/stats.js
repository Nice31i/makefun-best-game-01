// stats.js — run statistics for the results screen and the death screen.
// Every number shown on the settlement screen comes from here, so the
// "3 missions complete" screen is a real report of the run just played,
// never a staged number.
export class RunStats {
  constructor() {
    this.reset();
  }

  reset() {
    this.startedAt = 0; // game-time seconds when this run began
    this.elapsed = 0;
    this.cashEarned = 0;
    this.missionsDone = 0;
    this.peakWanted = 0;
    this.deaths = 0;
    this.carsStolen = 0;
    this.shotsFired = 0;
    this.thugsBeaten = 0;
    this.pickupsTaken = 0;
    this.topSpeedKmh = 0;
  }

  begin(nowSeconds) {
    this.reset();
    this.startedAt = nowSeconds;
  }

  finish(nowSeconds) {
    this.elapsed = Math.max(0, nowSeconds - this.startedAt);
  }

  noteWanted(level) {
    if (level > this.peakWanted) this.peakWanted = level;
  }

  noteCash(amount) {
    if (amount > 0) this.cashEarned += amount;
  }

  noteSpeed(kmh) {
    if (kmh > this.topSpeedKmh) this.topSpeedKmh = Math.round(kmh);
  }

  // Rows for the settlement screen: [label, value].
  rows(finalCash) {
    return [
      ['用时', this.elapsedText()],
      ['最终现金', `$${Math.floor(finalCash).toLocaleString('en-US')}`],
      ['本局赚到', `$${Math.floor(this.cashEarned).toLocaleString('en-US')}`],
      ['完成任务', `${this.missionsDone} / 3`],
      ['通缉峰值', `${this.peakWanted} 星`],
      ['最高车速', `${this.topSpeedKmh} km/h`],
      ['偷车次数', `${this.carsStolen}`],
      ['开枪次数', `${this.shotsFired}`],
      ['打倒打手', `${this.thugsBeaten}`],
      ['拾取物品', `${this.pickupsTaken}`],
      ['倒下次数', `${this.deaths}`],
    ];
  }

  elapsedText() {
    const s = Math.max(0, Math.floor(this.elapsed));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }
}
