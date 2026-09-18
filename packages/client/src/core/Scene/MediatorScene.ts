import * as d3 from "d3";
import { AppMediator } from "../AppMediator";
import { SvgEngine } from "../Engines/SvgEngine";

interface EventFlow {
  event: string;
  senders: string[];
  receivers: string[];
}

interface FlowNode {
  id: string;
  label: string;
  x: number;
  y: number;
  height: number;
  column: "sender" | "event" | "receiver";
}

interface FlowLink {
  source: FlowNode;
  target: FlowNode;
}

/**
 * Визуализирует маршрутизацию событий AppMediator.
 *
 * Медиатор намеренно не является узлом графа:
 *
 *   отправитель -> событие -> получатель
 *
 * Стиль диаграммы вдохновлён D3 Sankey: узлы расположены в трёх
 * вертикальных колонках, а связи между ними рисуются плавными кривыми.
 */
export class MediatorScene {
  private rootGroup: d3.Selection<SVGGElement, unknown, null, undefined>;

  private readonly flows: EventFlow[] = [
    {
      event: AppMediator.PROGRESS,
      senders: ["AppMediator"],
      receivers: ["ControlPanel"],
    },
    {
      event: AppMediator.TARGET_SIZE,
      senders: ["AppMediator"],
      receivers: ["PointsScene"],
    },
    {
      event: AppMediator.TEMPERATURE,
      senders: ["RepulsionEngine", "GraphEngine", "ZDampingEngine"],
      receivers: ["ControlPanel"],
    },
    {
      event: AppMediator.SIZE_TEXT,
      senders: ["AppMediator"],
      receivers: ["PointsScene"],
    },
    {
      event: AppMediator.AUTO_ZOOM,
      senders: ["AppMediator"],
      receivers: ["PointsScene"],
    },
    {
      event: AppMediator.SELECTED_POINT,
      senders: ["PointsScene"],
      receivers: ["PointsScene", "EdgesScene", "AdaptiveInfoContent"],
    },
    {
      event: AppMediator.SELECTED_EDGE,
      senders: ["EdgesScene"],
      receivers: ["AdaptiveInfoContent"],
    },
    {
      event: AppMediator.POINT_CHANGE,
      senders: ["PointInfoPanel"],
      receivers: ["PointsScene"],
    },
    {
      event: AppMediator.EDGE_UPDATE,
      senders: ["EdgeInfoPanel"],
      receivers: [],
    },
    {
      event: AppMediator.POINT_UPDATED,
      senders: ["PointsScene"],
      receivers: ["EdgesScene", "PointsTransformer"],
    },
    {
      event: AppMediator.POINTS_UPDATED,
      senders: [],
      receivers: ["PointsTransformer"],
    },
    {
      event: AppMediator.POINTS_UPDATING,
      senders: ["AnimationEngine"],
      receivers: ["PointsScene", "EdgesScene"],
    },
    {
      event: AppMediator.POINTS_GRAPH_UPDATED,
      senders: ["PointGraphManager"],
      receivers: ["PointsScene", "EdgesScene"],
    },
    {
      event: AppMediator.MODEL_MANAGER_STEP,
      senders: ["ControlPanel"],
      receivers: ["ModelManager"],
    },
    {
      event: AppMediator.CLEAR_POINTS,
      senders: ["ControlPanel"],
      receivers: [],
    },
    {
      event: AppMediator.ADD_POINT,
      senders: ["ControlPanel"],
      receivers: [],
    },
    {
      event: AppMediator.START_REPULSION,
      senders: ["ControlPanel"],
      receivers: ["RepulsionEngine", "GraphEngine", "ZDampingEngine"],
    },
    {
      event: AppMediator.START_GRAPH,
      senders: ["ControlPanel"],
      receivers: [],
    },
    {
      event: AppMediator.RELOAD_TABLES,
      senders: ["DataManager"],
      receivers: [],
    },
    {
      event: AppMediator.SAVE_POSITIONS,
      senders: ["ControlPanel"],
      receivers: ["PointsTransformer"],
    },
    {
      event: AppMediator.POSITIONS_SAVED,
      senders: ["PointsTransformer"],
      receivers: ["ControlPanel"],
    },
    {
      event: AppMediator.POINT_UPDATING,
      senders: ["PointsScene"],
      receivers: ["EdgesScene"],
    },
  ];

  constructor(
    private mediator: AppMediator,
    private svgEngine: SvgEngine,
    groupName = "mediator-scene",
  ) {
    this.rootGroup = svgEngine.createGroup(groupName);
    this.render();
  }

  public destroy(): void {
    this.rootGroup.remove();
  }

  private render(): void {
    this.rootGroup.selectAll("*").remove();

    const [width, height] = this.svgEngine.getClientSize();
    const margin = {
      top: 50,
      right: 180,
      bottom: 30,
      left: 180,
    };

    const innerWidth = Math.max(200, width - margin.left - margin.right);
    const innerHeight = Math.max(200, height - margin.top - margin.bottom);

    const senderColumnX = margin.left;
    const eventColumnX = margin.left + innerWidth / 2;
    const receiverColumnX = width - margin.right;

    const eventFlows = this.flows.filter(
      (flow) => flow.senders.length > 0 && flow.receivers.length > 0,
    );

    const eventNodes = eventFlows.map((flow) => flow.event);
    const senderNames = this.unique(
      eventFlows.flatMap((flow) => flow.senders),
    );
    const receiverNames = this.unique(
      eventFlows.flatMap((flow) => flow.receivers),
    );

    const senderNodes = this.createNodes(
      senderNames,
      "sender",
      senderColumnX,
      innerHeight,
      margin.top,
    );
    const eventNodeMap = new Map<string, FlowNode>();
    const eventNodeHeight = Math.max(18, Math.min(28, innerHeight / Math.max(eventNodes.length, 1) - 4));

    const eventGap = Math.max(
      4,
      (innerHeight - eventNodes.length * eventNodeHeight) /
        Math.max(eventNodes.length - 1, 1),
    );

    eventNodes.forEach((name, index) => {
      eventNodeMap.set(name, {
        id: `event:${name}`,
        label: name,
        x: eventColumnX,
        y: margin.top + index * (eventNodeHeight + eventGap),
        height: eventNodeHeight,
        column: "event",
      });
    });

    const receiverNodes = this.createNodes(
      receiverNames,
      "receiver",
      receiverColumnX,
      innerHeight,
      margin.top,
    );

    const senderMap = new Map(senderNodes.map((node) => [node.label, node]));
    const receiverMap = new Map(receiverNodes.map((node) => [node.label, node]));

    const links: FlowLink[] = [];

    for (const flow of eventFlows) {
      const eventNode = eventNodeMap.get(flow.event);
      if (!eventNode) continue;

      for (const sender of flow.senders) {
        const senderNode = senderMap.get(sender);
        if (senderNode) {
          links.push({ source: senderNode, target: eventNode });
        }
      }

      for (const receiver of flow.receivers) {
        const receiverNode = receiverMap.get(receiver);
        if (receiverNode) {
          links.push({ source: eventNode, target: receiverNode });
        }
      }
    }

    this.renderLinks(links);
    this.renderNodes(senderNodes, "sender");
    this.renderNodes(Array.from(eventNodeMap.values()), "event");
    this.renderNodes(receiverNodes, "receiver");

    this.rootGroup
      .append("text")
      .attr("class", "mediator-scene__title")
      .attr("x", width / 2)
      .attr("y", 24)
      .attr("text-anchor", "middle")
      .text("AppMediator");

    this.rootGroup
      .append("text")
      .attr("class", "mediator-scene__column-title")
      .attr("x", senderColumnX)
      .attr("y", margin.top - 18)
      .attr("text-anchor", "middle")
      .text("Вызывает");

    this.rootGroup
      .append("text")
      .attr("class", "mediator-scene__column-title")
      .attr("x", eventColumnX)
      .attr("y", margin.top - 18)
      .attr("text-anchor", "middle")
      .text("Событие");

    this.rootGroup
      .append("text")
      .attr("class", "mediator-scene__column-title")
      .attr("x", receiverColumnX)
      .attr("y", margin.top - 18)
      .attr("text-anchor", "middle")
      .text("Получатель");
  }

  private createNodes(
    names: string[],
    column: FlowNode["column"],
    x: number,
    height: number,
    top: number,
  ): FlowNode[] {
    const nodeHeight = 24;
    const gap = Math.max(
      6,
      (height - names.length * nodeHeight) / Math.max(names.length - 1, 1),
    );

    return names.map((name, index) => ({
      id: `${column}:${name}`,
      label: name,
      x,
      y: top + index * (nodeHeight + gap),
      height: nodeHeight,
      column,
    }));
  }

  private renderLinks(links: FlowLink[]): void {
    const linkGroup = this.rootGroup
      .append("g")
      .attr("class", "mediator-scene__links")
      .attr("fill", "none");

    linkGroup
      .selectAll<SVGPathElement, FlowLink>("path")
      .data(links)
      .join("path")
      .attr("class", "mediator-scene__link")
      .attr("d", (link) => this.createLinkPath(link))
      .attr("stroke-width", 2);
  }

  private renderNodes(nodes: FlowNode[], column: FlowNode["column"]): void {
    const nodeGroup = this.rootGroup
      .append("g")
      .attr("class", `mediator-scene__nodes mediator-scene__nodes--${column}`);

    const node = nodeGroup
      .selectAll<SVGGElement, FlowNode>("g")
      .data(nodes)
      .join("g")
      .attr("class", "mediator-scene__node");

    node
      .append("rect")
      .attr("x", (d) => d.x - 70)
      .attr("y", (d) => d.y)
      .attr("width", 140)
      .attr("height", (d) => d.height)
      .attr("rx", 4);

    node
      .append("text")
      .attr("x", (d) => d.x)
      .attr("y", (d) => d.y + d.height / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .text((d) => d.label);
  }

  private createLinkPath(link: FlowLink): string {
    const sourceX =
      link.source.column === "sender"
        ? link.source.x + 70
        : link.source.x + 70;
    const targetX =
      link.target.column === "receiver"
        ? link.target.x - 70
        : link.target.x - 70;

    const sourceY = link.source.y + link.source.height / 2;
    const targetY = link.target.y + link.target.height / 2;
    const controlX = (sourceX + targetX) / 2;

    return `M ${sourceX},${sourceY} C ${controlX},${sourceY} ${controlX},${targetY} ${targetX},${targetY}`;
  }

  private unique(values: string[]): string[] {
    return Array.from(new Set(values));
  }
}
