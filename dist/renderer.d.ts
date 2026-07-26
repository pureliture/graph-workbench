import { Object3D } from "three";
import type { RenderLink, RenderNode } from "./layout.js";
import type { GraphLinkDescriptor, GraphNodeDescriptor } from "./presentation.js";
import type { GraphRenderer, GraphRendererFactoryOptions } from "./renderer-contract.js";
export type { GraphLinkObjectFactory, GraphAmbientMotionLinkEndpointObservation, GraphAmbientMotionLinkFlowObservation, GraphAmbientMotionNodePosition, GraphAmbientMotionPosition, GraphAmbientMotionObservation, GraphAmbientMotionParticleObservation, GraphAmbientMotionScreenPosition, GraphRenderLinkObservation, GraphRenderNodeObservation, GraphRenderNodeLabelObservation, GraphRenderObjectObservation, GraphRenderObservation, GraphRenderTransformObservation, GraphNodeObjectFactory, GraphRenderer, GraphRendererFactoryOptions, GraphScreenPosition, GraphTransitionNodePosition, GraphTransitionObservation, } from "./renderer-contract.js";
export declare function createDefaultGraphNodeObject(node: RenderNode, descriptor: GraphNodeDescriptor | undefined): Object3D;
export declare function createDefaultGraphLinkObject(link: RenderLink, descriptor: GraphLinkDescriptor | undefined): Object3D;
export declare function createThreeForceGraphRenderer({ callbacks, container, nodeObjectFactory, linkObjectFactory, }: GraphRendererFactoryOptions): GraphRenderer;
//# sourceMappingURL=renderer.d.ts.map