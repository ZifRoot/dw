import { AppMediator } from "../AppMediator";
import { AnimationCallback, AnimationEngine } from "../Engines/AnimationEngine";
import { Point } from "../models/Point";
import { PointModel } from "../models/PointModel";

export class RepulsionEngineConfig {
  public repulsionStrength = 0.2;
  public minDistance = 1;
  public targetDistance = 100;
  public epsilon = 1e-6;
  public stopTemperature = 0.1;
}

export class RepulsionEngine {
  private temperature = 0;
  private targetDistSq: number;
  public points: PointModel[] = [];
  private unsubCallback: AnimationCallback | null = null;
  private readonly unsubStartRepulsion: () => void;

  constructor(
    public mediator: AppMediator,
    public animation: AnimationEngine,
    public config: RepulsionEngineConfig,
  ) {
    this.targetDistSq = config.targetDistance ** 2;
    this.unsubStartRepulsion = mediator.onStartRepulsion(() => this.start());
  }

  public destroy(): void {
    this.stop();
    this.unsubStartRepulsion();
  }

  start() {
    this.unsubCallback ??= this.animation.addCallback(() => this.step());
  }

  stop() {
    if (this.unsubCallback != null) {
      this.unsubCallback();
      this.unsubCallback = null;
    }
  }

  public setPoints(points: PointModel[]) {
    this.points = points;
  }

  private step(): void {
    this.temperature = this.applyStep();
    this.mediator.temperature = this.temperature;
    if (this.temperature < this.config.stopTemperature) {
      this.stop();
    }
  }

  applyPair1(p1: PointModel, p2: PointModel) {
    const targetDistance = this.config.targetDistance;
    const minDistance = this.config.minDistance;

    if (p1.fixed && p2.fixed) return null;

    let d = p1.subNew(p2);
    const distSq = d.lenSq();
    if (distSq >= this.targetDistSq) return null;

    if (distSq < this.config.epsilon) {
      // Случайный разброс
      const shift = Point.RandomSphere().scale(minDistance);
      return { target1: p1.addNew(shift), target2: p2.subNew(shift) };
    } else {
      const dist = Math.sqrt(distSq);
      const unit = d.scaleNew(1 / dist);
      const delta = targetDistance - dist;

      if (p1.fixed) {
        return { target1: p1.clone(), target2: p2.addNew(unit.scaleNew(delta)) };
      }
      if (p2.fixed) {
        return { target1: p1.addNew(unit.scaleNew(-delta)), target2: p2.clone() };
      } else {
        const half = delta / 2;
        return { target1: p1.addNew(unit.scaleNew(-half)), target2: p2.addNew(unit.scaleNew(half)) };
      }
    }
  }

  applyPair2(p1: PointModel, p2: PointModel) {
    let fd = this.applyPair1(p1, p2);

    if (!fd) return -1;

    p1.smoothMove(fd.target1, this.config.repulsionStrength);
    p2.smoothMove(fd.target2, this.config.repulsionStrength);

    let temperature = (p1.distTo(fd.target1) + p2.distTo(fd.target2)) / this.config.targetDistance;

    return temperature;
  }

  applyPair(p1: PointModel, p2: PointModel) {
    const targetDistance = this.config.targetDistance;
    const minDistance = this.config.minDistance;
    const repulsionStrength = this.config.repulsionStrength;
    const stopTemperature2 = this.config.stopTemperature * 2;
    // Быстрая проверка: оба фиксированы – пропускаем
    if (p1.fixed && p2.fixed) return -1;

    let d = p1.subNew(p2);

    const distSq = d.lenSq();
    if (distSq >= this.targetDistSq) return -1;

    let temperature: number;

    if (distSq < this.config.epsilon) {
      // Случайное расталкивание при нулевом расстоянии
      d = Point.RandomSphere().scale(minDistance);
      temperature = stopTemperature2;
    } else {
      const dist = Math.sqrt(distSq);
      // Коэффициент силы с учётом фиксации
      const factor = p1.fixed || p2.fixed ? 1.0 : 0.5;
      const kk = targetDistance / dist - 1;
      const k = kk * factor * repulsionStrength;
      d.scale(k);
      temperature = Math.abs(kk);
    }

    if (!p1.fixed) {
      p1.add(d);
    }
    if (!p2.fixed) {
      p2.sub(d);
    }
    return temperature;
  }

  private applyStep(): number {
    const points = this.points;
    const len = points.length;
    let maxShift = -1;

    for (let i = 0; i < len; i++) {
      for (let j = i + 1; j < len; j++) {
        const temperature = this.applyPair(points[i], points[j]);
        maxShift = Math.max(maxShift, temperature);
      }
    }
    return maxShift;
  }
}
