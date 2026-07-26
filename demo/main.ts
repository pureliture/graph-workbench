import { createBrowserGraphWorkbench } from "../src/browser.js";
import { fixture } from "./fixture.js";

const graph = document.querySelector<HTMLElement>("#graph");
const eventOutput = document.querySelector<HTMLOutputElement>("#event");

if (!graph || !eventOutput) {
  throw new Error("fixture DOM is incomplete");
}

const renderEvent = (value: string) => {
  eventOutput.value = value;
  eventOutput.textContent = value;
};

const workbench = createBrowserGraphWorkbench({
  input: fixture,
  onBackgroundClick: () => renderEvent("Background selected — host selection cleared."),
  onFocusChange: ({ nodeId }) => renderEvent(`Focus: ${nodeId ?? "none"}`),
  onNodeClick: ({ nodeId }) => renderEvent(`Selection: ${nodeId}`),
  onNodeHover: ({ nodeId }) => {
    if (nodeId) renderEvent(`Hover: ${nodeId}`);
  },
  onRendererStateChange: ({ reason, status }) => renderEvent(
    status === "failed" ? `Renderer failed: ${reason}` : `Renderer: ${status}`,
  ),
});

workbench.mount(graph);
workbench.fit(0);
window.addEventListener("resize", () => workbench.resize());
