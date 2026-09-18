import * as d3 from "d3";
import { AppMediator } from "../AppMediator";
import { SvgEngine } from "../Engines/SvgEngine";

export class MediatorScene {
  private rootGroup: d3.Selection<SVGGElement, unknown, null, undefined>;

  constructor(
    private mediator: AppMediator,
    private svgEngine: SvgEngine,
    groupName = "mediator-scene",
  ) {
    this.rootGroup = svgEngine.createGroup(groupName);
  }

  public destroy(): void {
    this.rootGroup.remove();
  }
}
