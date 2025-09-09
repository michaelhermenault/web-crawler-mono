import ForceGraph2D from "react-force-graph-2d";
import React from "react";

const maxNodeLabelLength = 30;
const defaultIconSize = 20;
const scaleForLabels = 1.7;
const arrowSize = 4;

const handleNodeClick = (node) => {
  window.open("http://" + node.id, "_blank");
};

function drawIcon(imageContainer, ctx, xPos, yPos, iconSize) {
  if (imageContainer !== undefined && imageContainer.imgLoaded) {
    ctx.drawImage(imageContainer.image, xPos, yPos, iconSize, iconSize);
  }
}

const CrawlGraph = ({ graphData }) => {
  return (
    <ForceGraph2D
      nodeCanvasObjectMode={() => "replace"}
      nodeRelSize={15}
      d3VelocityDecay={0.7}
      linkDirectionalArrowLength={arrowSize}
      onNodeClick={handleNodeClick}
      enableNodeDrag={false}
      graphData={graphData}
      backgroundColor="white"
      nodeCanvasObject={(node, ctx, globalScale) => {
        const drawnSize = defaultIconSize / globalScale;
        drawIcon(
          node.imageContainer,
          ctx,
          node.x - drawnSize / 2,
          node.y - drawnSize / 2,
          drawnSize
        );
        if (globalScale > scaleForLabels) {
          const label =
            node.id.length > maxNodeLabelLength
              ? node.id.slice(0, maxNodeLabelLength) + "..."
              : node.id;

          const fontSize = 12 / globalScale;
          ctx.font = `${fontSize}px Sans-Serif`;
          const textWidth = ctx.measureText(label).width;
          const bckgDimensions = [textWidth, fontSize].map(
            (n) => n + fontSize * 0.2
          );

          ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
          ctx.fillRect(
            node.x - bckgDimensions[0] / 2,
            node.y + drawnSize / 2,
            ...bckgDimensions
          );

          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "black";
          ctx.fillText(
            label,
            node.x,
            node.y + bckgDimensions[1] / 2 + drawnSize / 2
          );
        }
      }}
    />
  );
};

export { CrawlGraph };
