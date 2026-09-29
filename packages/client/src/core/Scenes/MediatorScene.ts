import * as d3 from "d3";
import { AppMediator } from "@core/AppMediator";
import { SvgEngine } from "@core/Engines/SvgEngine";

interface FlowEndpoint {
  name: string;
  lines: number[];
}

interface EventFlow {
  event: string;
  senders: FlowEndpoint[];
  receivers: FlowEndpoint[];
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
      senders: [{ name: "index.ts", lines: [68] }],
      receivers: [{ name: "ControlPanel", lines: [29] }],
    },
    {
      event: AppMediator.TARGET_SIZE,
      senders: [
        { name: "index.ts", lines: [67] },
        { name: "ControlPanel", lines: [52] },
      ],
      receivers: [],
    },
    {
      event: AppMediator.PIPELINE_STATE_CHANGED,
      senders: [{ name: "EnginePipeline", lines: [60] }],
      receivers: [{ name: "PipelinePanel", lines: [30] }],
    },
    {
      event: AppMediator.SIZE_TEXT,
      senders: [{ name: "index.ts", lines: [69] }],
      receivers: [
        { name: "PointsScene", lines: [40] },
        { name: "AdaptiveInfoContent", lines: [27] },
      ],
    },
    {
      event: AppMediator.AUTO_ZOOM,
      senders: [
        { name: "index.ts", lines: [72] },
        { name: "ControlPanel", lines: [69] },
      ],
      receivers: [{ name: "PointsScene", lines: [41] }],
    },
    {
      event: AppMediator.SELECTED_POINT,
      senders: [{ name: "PointsScene", lines: [131, 284] }],
      receivers: [
        { name: "EdgesScene", lines: [32] },
        { name: "AdaptiveInfoContent", lines: [25] },
      ],
    },
    {
      event: AppMediator.SELECTED_EDGE,
      senders: [{ name: "EdgesScene", lines: [53] }],
      receivers: [{ name: "AdaptiveInfoContent", lines: [26] }],
    },
    {
      event: AppMediator.POINT_CHANGE,
      senders: [{ name: "PointInfoPanel", lines: [27, 33] }],
      receivers: [{ name: "PointsScene", lines: [38] }],
    },
    {
      event: AppMediator.EDGE_UPDATE,
      senders: [{ name: "EdgeInfoPanel", lines: [26] }],
      receivers: [],
    },
    {
      event: AppMediator.POINT_UPDATED,
      senders: [{ name: "PointsScene", lines: [70, 219] }],
      receivers: [
        { name: "EdgesScene", lines: [36] },
        { name: "PointsTransformer", lines: [34] },
      ],
    },
    {
      event: AppMediator.POINTS_UPDATED,
      senders: [{ name: "EnginePipeline", lines: [327] }],
      receivers: [{ name: "PointsTransformer", lines: [29] }],
    },
    {
      event: AppMediator.POINTS_UPDATING,
      senders: [{ name: "EnginePipeline", lines: [96] }],
      receivers: [
        { name: "PointsScene", lines: [39] },
        { name: "EdgesScene", lines: [34] },
      ],
    },
    {
      event: AppMediator.POINTS_GRAPH_UPDATED,
      senders: [
        { name: "ModelManager", lines: [154, 201] },
        { name: "PointsSceneTester", lines: [121] },
      ],
      receivers: [
        { name: "PointsScene", lines: [36] },
        { name: "EdgesScene", lines: [33] },
      ],
    },
    {
      event: AppMediator.MODEL_MANAGER_STEP,
      senders: [{ name: "ControlPanel", lines: [63] }],
      receivers: [{ name: "ModelManager", lines: [67] }],
    },
    {
      event: AppMediator.CLEAR_POINTS,
      senders: [{ name: "ControlPanel", lines: [58] }],
      receivers: [],
    },
    {
      event: AppMediator.ADD_POINT,
      senders: [{ name: "ControlPanel", lines: [57] }],
      receivers: [],
    },
    {
      event: AppMediator.START_REPULSION,
      senders: [{ name: "ControlPanel", lines: [59] }],
      receivers: [{ name: "EnginePipeline", lines: [27] }],
    },
    {
      event: AppMediator.START_GRAPH,
      senders: [{ name: "ControlPanel", lines: [60] }],
      receivers: [],
    },
    {
      event: AppMediator.RELOAD_TABLES,
      senders: [],
      receivers: [{ name: "DataManager", lines: [26] }],
    },
    {
      event: AppMediator.SAVE_POSITIONS,
      senders: [{ name: "ControlPanel", lines: [61] }],
      receivers: [{ name: "PointsTransformer", lines: [41] }],
    },
    {
      event: AppMediator.POSITIONS_SAVED,
      senders: [{ name: "PointsTransformer", lines: [129] }],
      receivers: [{ name: "ControlPanel", lines: [32] }],
    },
    {
      event: AppMediator.POINT_UPDATING,
      senders: [{ name: "PointsScene", lines: [209] }],
      receivers: [{ name: "EdgesScene", lines: [37] }],
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

    const eventNodes = this.flows.map((flow) => flow.event);
    const senderEndpoints = this.uniqueEndpoints(this.flows.flatMap((flow) => flow.senders));
    const receiverEndpoints = this.uniqueEndpoints(this.flows.flatMap((flow) => flow.receivers));

    const senderNodes = this.createNodes(senderEndpoints, "sender", senderColumnX, innerHeight, margin.top);
    const eventNodeMap = new Map<string, FlowNode>();
    const eventNodeHeight = Math.max(18, Math.min(28, innerHeight / Math.max(eventNodes.length, 1) - 4));

    const eventGap = Math.max(4, (innerHeight - eventNodes.length * eventNodeHeight) / Math.max(eventNodes.length - 1, 1));

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

    const receiverNodes = this.createNodes(receiverEndpoints, "receiver", receiverColumnX, innerHeight, margin.top);

    const senderMap = new Map(senderNodes.map((node) => [node.id, node]));
    const receiverMap = new Map(receiverNodes.map((node) => [node.id, node]));

    const links: FlowLink[] = [];

    for (const flow of this.flows) {
      const eventNode = eventNodeMap.get(flow.event);
      if (!eventNode) continue;

      for (const sender of flow.senders) {
        const senderNode = senderMap.get(`sender:${sender.name}`);
        if (senderNode) {
          links.push({ source: senderNode, target: eventNode });
        }
      }

      for (const receiver of flow.receivers) {
        const receiverNode = receiverMap.get(`receiver:${receiver.name}`);
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
      .text("AppMediator — актуально на коммит 58158128cc49b62414e193d631ca3566fb0e03a9");

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

  private createNodes(endpoints: FlowEndpoint[], column: FlowNode["column"], x: number, height: number, top: number): FlowNode[] {
    const nodeHeight = 24;
    const gap = Math.max(6, (height - endpoints.length * nodeHeight) / Math.max(endpoints.length - 1, 1));

    return endpoints.map((endpoint, index) => ({
      id: `${column}:${endpoint.name}`,
      label: this.endpointLabel(endpoint),
      x,
      y: top + index * (nodeHeight + gap),
      height: nodeHeight,
      column,
    }));
  }

  private renderLinks(links: FlowLink[]): void {
    const linkGroup = this.rootGroup.append("g").attr("class", "mediator-scene__links").attr("fill", "none");

    linkGroup
      .selectAll<SVGPathElement, FlowLink>("path")
      .data(links)
      .join("path")
      .attr("class", "mediator-scene__link")
      .attr("d", (link) => this.createLinkPath(link))
      .attr("stroke-width", 2);
  }

  private renderNodes(nodes: FlowNode[], column: FlowNode["column"]): void {
    const nodeGroup = this.rootGroup.append("g").attr("class", `mediator-scene__nodes mediator-scene__nodes--${column}`);

    const node = nodeGroup.selectAll<SVGGElement, FlowNode>("g").data(nodes).join("g").attr("class", "mediator-scene__node");

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
    const sourceX = link.source.column === "sender" ? link.source.x + 70 : link.source.x + 70;
    const targetX = link.target.column === "receiver" ? link.target.x - 70 : link.target.x - 70;

    const sourceY = link.source.y + link.source.height / 2;
    const targetY = link.target.y + link.target.height / 2;
    const controlX = (sourceX + targetX) / 2;

    return `M ${sourceX},${sourceY} C ${controlX},${sourceY} ${controlX},${targetY} ${targetX},${targetY}`;
  }

  private uniqueEndpoints(values: FlowEndpoint[]): FlowEndpoint[] {
    const map = new Map<string, FlowEndpoint>();

    for (const value of values) {
      const existing = map.get(value.name);
      if (existing) {
        existing.lines = Array.from(new Set([...existing.lines, ...value.lines]));
      } else {
        map.set(value.name, {
          name: value.name,
          lines: [...value.lines],
        });
      }
    }

    return Array.from(map.values());
  }

  private endpointLabel(endpoint: FlowEndpoint): string {
    return `${endpoint.name} [${endpoint.lines.join(", ")}]`;
  }
}
