/*
Copyright 2022 Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDrag, useGesture } from "@use-gesture/react";
import { useSprings } from "@react-spring/web";
import useMeasure from "react-use-measure";
import { ResizeObserver } from "@juggle/resize-observer";
import styles from "./VideoGrid.module.css";

export function useVideoGridLayout(hasScreenshareFeeds) {
  const layoutRef = useRef("freedom");
  const revertLayoutRef = useRef("freedom");
  const prevHasScreenshareFeeds = useRef(hasScreenshareFeeds);
  const [, forceUpdate] = useState({});

  const setLayout = useCallback((layout) => {
    // Store the user's set layout to revert to after a screenshare is finished
    revertLayoutRef.current = layout;
    layoutRef.current = layout;
    forceUpdate({});
  }, []);

  // Note: We need the returned layout to update synchronously with a change in hasScreenshareFeeds
  // so use refs and avoid useEffect.
  if (prevHasScreenshareFeeds.current !== hasScreenshareFeeds) {
    if (hasScreenshareFeeds) {
      // Automatically switch to spotlight layout when there's a screenshare
      layoutRef.current = "spotlight";
    } else {
      // When the screenshares have ended, revert to the previous layout
      layoutRef.current = revertLayoutRef.current;
    }
  }

  prevHasScreenshareFeeds.current = hasScreenshareFeeds;

  return [layoutRef.current, setLayout];
}

const GAP = 8;

function useIsMounted() {
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return isMountedRef;
}

function isInside([x, y], targetTile) {
  const left = targetTile.x;
  const top = targetTile.y;
  const bottom = targetTile.y + targetTile.height;
  const right = targetTile.x + targetTile.width;

  if (x < left || x > right || y < top || y > bottom) {
    return false;
  }

  return true;
}

const getPipGap = (gridAspectRatio) => (gridAspectRatio < 1 ? 12 : 24);

function getTilePositions(
  tileCount,
  presenterTileCount,
  gridWidth,
  gridHeight,
  pipXRatio,
  pipYRatio,
  layout
) {
  if (layout === "freedom") {
    if (tileCount === 2 && presenterTileCount === 0) {
      return getOneOnOneLayoutTilePositions(
        gridWidth,
        gridHeight,
        pipXRatio,
        pipYRatio
      );
    }

    return getFreedomLayoutTilePositions(
      tileCount,
      presenterTileCount,
      gridWidth,
      gridHeight
    );
  } else {
    return getSpotlightLayoutTilePositions(tileCount, gridWidth, gridHeight);
  }
}

function getOneOnOneLayoutTilePositions(
  gridWidth,
  gridHeight,
  pipXRatio,
  pipYRatio
) {
  const [remotePosition] = getFreedomLayoutTilePositions(
    1,
    0,
    gridWidth,
    gridHeight
  );

  const gridAspectRatio = gridWidth / gridHeight;

  const pipWidth = gridAspectRatio < 1 ? 114 : 230;
  const pipHeight = gridAspectRatio < 1 ? 163 : 155;
  const pipGap = getPipGap(gridAspectRatio);

  const pipMinX = remotePosition.x + pipGap;
  const pipMinY = remotePosition.y + pipGap;
  const pipMaxX = remotePosition.x + remotePosition.width - pipWidth - pipGap;
  const pipMaxY = remotePosition.y + remotePosition.height - pipHeight - pipGap;

  return [
    {
      // Apply the PiP position as a proportion of the available space
      x: pipMinX + pipXRatio * (pipMaxX - pipMinX),
      y: pipMinY + pipYRatio * (pipMaxY - pipMinY),
      width: pipWidth,
      height: pipHeight,
      zIndex: 1,
    },
    remotePosition,
  ];
}

function getSpotlightLayoutTilePositions(tileCount, gridWidth, gridHeight) {
  const tilePositions = [];

  const gridAspectRatio = gridWidth / gridHeight;

  if (gridAspectRatio < 1) {
    // Vertical layout (mobile)
    const spotlightTileHeight =
      tileCount > 1 ? (gridHeight - GAP * 3) * (4 / 5) : gridHeight - GAP * 2;
    const spectatorTileSize =
      tileCount > 1 ? gridHeight - GAP * 3 - spotlightTileHeight : 0;

    for (let i = 0; i < tileCount; i++) {
      if (i === 0) {
        // Spotlight tile
        tilePositions.push({
          x: GAP,
          y: GAP,
          width: gridWidth - GAP * 2,
          height: spotlightTileHeight,
          zIndex: 0,
        });
      } else {
        // Spectator tile
        tilePositions.push({
          x: (GAP + spectatorTileSize) * (i - 1) + GAP,
          y: spotlightTileHeight + GAP * 2,
          width: spectatorTileSize,
          height: spectatorTileSize,
          zIndex: 0,
        });
      }
    }
  } else {
    // Horizontal layout (desktop)
    const spotlightTileWidth =
      tileCount > 1 ? ((gridWidth - GAP * 3) * 4) / 5 : gridWidth - GAP * 2;
    const spectatorTileWidth =
      tileCount > 1 ? gridWidth - GAP * 3 - spotlightTileWidth : 0;
    const spectatorTileHeight = spectatorTileWidth * (9 / 16);

    for (let i = 0; i < tileCount; i++) {
      if (i === 0) {
        tilePositions.push({
          x: GAP,
          y: GAP,
          width: spotlightTileWidth,
          height: gridHeight - GAP * 2,
          zIndex: 0,
        });
      } else {
        tilePositions.push({
          x: GAP * 2 + spotlightTileWidth,
          y: (GAP + spectatorTileHeight) * (i - 1) + GAP,
          width: spectatorTileWidth,
          height: spectatorTileHeight,
          zIndex: 0,
        });
      }
    }
  }

  return tilePositions;
}

function getFreedomLayoutTilePositions(
  tileCount,
  presenterTileCount,
  gridWidth,
  gridHeight
) {
  if (tileCount === 0) {
    return [];
  }

  if (tileCount > 12) {
    console.warn("Over 12 tiles is not currently supported");
  }

  const { layoutDirection, itemGridRatio } = getGridLayout(
    tileCount,
    presenterTileCount,
    gridWidth,
    gridHeight
  );

  let itemGridWidth;
  let itemGridHeight;

  if (layoutDirection === "vertical") {
    itemGridWidth = gridWidth;
    itemGridHeight = Math.round(gridHeight * itemGridRatio);
  } else {
    itemGridWidth = Math.round(gridWidth * itemGridRatio);
    itemGridHeight = gridHeight;
  }

  const itemTileCount = tileCount - presenterTileCount;

  const {
    columnCount: itemColumnCount,
    rowCount: itemRowCount,
    tileAspectRatio: itemTileAspectRatio,
  } = getSubGridLayout(itemTileCount, itemGridWidth, itemGridHeight);

  const itemGridPositions = getSubGridPositions(
    itemTileCount,
    itemColumnCount,
    itemRowCount,
    itemTileAspectRatio,
    itemGridWidth,
    itemGridHeight
  );
  const itemGridBounds = getSubGridBoundingBox(itemGridPositions);

  let presenterGridWidth;
  let presenterGridHeight;

  if (presenterTileCount === 0) {
    presenterGridWidth = 0;
    presenterGridHeight = 0;
  } else if (layoutDirection === "vertical") {
    presenterGridWidth = gridWidth;
    presenterGridHeight =
      gridHeight - (itemGridBounds.height + (itemTileCount ? GAP * 2 : 0));
  } else {
    presenterGridWidth =
      gridWidth - (itemGridBounds.width + (itemTileCount ? GAP * 2 : 0));
    presenterGridHeight = gridHeight;
  }

  const {
    columnCount: presenterColumnCount,
    rowCount: presenterRowCount,
    tileAspectRatio: presenterTileAspectRatio,
  } = getSubGridLayout(
    presenterTileCount,
    presenterGridWidth,
    presenterGridHeight
  );

  const presenterGridPositions = getSubGridPositions(
    presenterTileCount,
    presenterColumnCount,
    presenterRowCount,
    presenterTileAspectRatio,
    presenterGridWidth,
    presenterGridHeight
  );

  const tilePositions = [...presenterGridPositions, ...itemGridPositions];

  centerTiles(
    presenterGridPositions,
    presenterGridWidth,
    presenterGridHeight,
    0,
    0
  );

  if (layoutDirection === "vertical") {
    centerTiles(
      itemGridPositions,
      gridWidth,
      gridHeight - presenterGridHeight,
      0,
      presenterGridHeight
    );
  } else {
    centerTiles(
      itemGridPositions,
      gridWidth - presenterGridWidth,
      gridHeight,
      presenterGridWidth,
      0
    );
  }

  return tilePositions;
}

function getSubGridBoundingBox(positions) {
  let left = 0;
  let right = 0;
  let top = 0;
  let bottom = 0;

  for (let i = 0; i < positions.length; i++) {
    const { x, y, width, height } = positions[i];

    if (i === 0) {
      left = x;
      right = x + width;
      top = y;
      bottom = y + height;
    } else {
      if (x < left) {
        left = x;
      }

      if (y < top) {
        top = y;
      }

      if (x + width > right) {
        right = x + width;
      }

      if (y + height > bottom) {
        bottom = y + height;
      }
    }
  }

  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function isMobileBreakpoint(gridWidth, gridHeight) {
  const gridAspectRatio = gridWidth / gridHeight;
  return gridAspectRatio < 1;
}

function getGridLayout(tileCount, presenterTileCount, gridWidth, gridHeight) {
  let layoutDirection = "horizontal";
  let itemGridRatio = 1;

  if (presenterTileCount === 0) {
    return { itemGridRatio, layoutDirection };
  }

  if (isMobileBreakpoint(gridWidth, gridHeight)) {
    layoutDirection = "vertical";
    itemGridRatio = 1 / 3;
  } else {
    layoutDirection = "horizontal";
    itemGridRatio = 1 / 3;
  }

  return { itemGridRatio, layoutDirection };
}

function centerTiles(positions, gridWidth, gridHeight, offsetLeft, offsetTop) {
  const bounds = getSubGridBoundingBox(positions);

  const leftOffset = Math.round((gridWidth - bounds.width) / 2) + offsetLeft;
  const topOffset = Math.round((gridHeight - bounds.height) / 2) + offsetTop;

  applyTileOffsets(positions, leftOffset, topOffset);

  return positions;
}

function applyTileOffsets(positions, leftOffset, topOffset) {
  for (const position of positions) {
    position.x += leftOffset;
    position.y += topOffset;
  }

  return positions;
}

function getSubGridLayout(tileCount, gridWidth, gridHeight) {
  const gridAspectRatio = gridWidth / gridHeight;

  let columnCount;
  let rowCount;
  let tileAspectRatio = 16 / 9;

  if (gridAspectRatio < 3 / 4) {
    // Phone
    if (tileCount === 1) {
      columnCount = 1;
      rowCount = 1;
      tileAspectRatio = 0;
    } else if (tileCount <= 4) {
      columnCount = 1;
      rowCount = tileCount;
    } else if (tileCount <= 12) {
      columnCount = 2;
      rowCount = Math.ceil(tileCount / columnCount);
      tileAspectRatio = 0;
    } else {
      // Unsupported
      columnCount = 3;
      rowCount = Math.ceil(tileCount / columnCount);
      tileAspectRatio = 1;
    }
  } else if (gridAspectRatio < 1) {
    // Tablet
    if (tileCount === 1) {
      columnCount = 1;
      rowCount = 1;
      tileAspectRatio = 0;
    } else if (tileCount <= 4) {
      columnCount = 1;
      rowCount = tileCount;
    } else if (tileCount <= 12) {
      columnCount = 2;
      rowCount = Math.ceil(tileCount / columnCount);
    } else {
      // Unsupported
      columnCount = 3;
      rowCount = Math.ceil(tileCount / columnCount);
      tileAspectRatio = 1;
    }
  } else if (gridAspectRatio < 17 / 9) {
    // Computer
    if (tileCount === 1) {
      columnCount = 1;
      rowCount = 1;
    } else if (tileCount === 2) {
      columnCount = 2;
      rowCount = 1;
    } else if (tileCount <= 4) {
      columnCount = 2;
      rowCount = 2;
    } else if (tileCount <= 6) {
      columnCount = 3;
      rowCount = 2;
    } else if (tileCount <= 8) {
      columnCount = 4;
      rowCount = 2;
      tileAspectRatio = 1;
    } else if (tileCount <= 12) {
      columnCount = 4;
      rowCount = 3;
      tileAspectRatio = 1;
    } else {
      // Unsupported
      columnCount = 4;
      rowCount = 4;
    }
  } else if (gridAspectRatio <= 32 / 9) {
    // Ultrawide
    if (tileCount === 1) {
      columnCount = 1;
      rowCount = 1;
    } else if (tileCount === 2) {
      columnCount = 2;
      rowCount = 1;
    } else if (tileCount <= 4) {
      columnCount = 2;
      rowCount = 2;
    } else if (tileCount <= 6) {
      columnCount = 3;
      rowCount = 2;
    } else if (tileCount <= 8) {
      columnCount = 4;
      rowCount = 2;
    } else if (tileCount <= 12) {
      columnCount = 4;
      rowCount = 3;
    } else {
      // Unsupported
      columnCount = 4;
      rowCount = 4;
    }
  } else {
    // Super Ultrawide
    if (tileCount <= 6) {
      columnCount = tileCount;
      rowCount = 1;
    } else {
      columnCount = Math.ceil(tileCount / 2);
      rowCount = 2;
    }
  }

  return { columnCount, rowCount, tileAspectRatio };
}

function getSubGridPositions(
  tileCount,
  columnCount,
  rowCount,
  tileAspectRatio,
  gridWidth,
  gridHeight
) {
  if (tileCount === 0) {
    return [];
  }

  const newTilePositions = [];

  const boxWidth = Math.round(
    (gridWidth - GAP * (columnCount + 1)) / columnCount
  );
  const boxHeight = Math.round((gridHeight - GAP * (rowCount + 1)) / rowCount);

  let tileWidth;
  let tileHeight;

  if (tileAspectRatio) {
    const boxAspectRatio = boxWidth / boxHeight;

    if (boxAspectRatio > tileAspectRatio) {
      tileWidth = boxHeight * tileAspectRatio;
      tileHeight = boxHeight;
    } else {
      tileWidth = boxWidth;
      tileHeight = boxWidth / tileAspectRatio;
    }
  } else {
    tileWidth = boxWidth;
    tileHeight = boxHeight;
  }

  for (let i = 0; i < tileCount; i++) {
    const verticalIndex = Math.floor(i / columnCount);
    const top = verticalIndex * GAP + verticalIndex * tileHeight;

    let rowItemCount;

    if (verticalIndex + 1 === rowCount && tileCount % columnCount !== 0) {
      rowItemCount = tileCount % columnCount;
    } else {
      rowItemCount = columnCount;
    }

    const horizontalIndex = i % columnCount;

    let centeringPadding = 0;

    if (rowItemCount < columnCount) {
      const subgridWidth = tileWidth * columnCount + (GAP * columnCount - 1);
      centeringPadding = Math.round(
        (subgridWidth - (tileWidth * rowItemCount + (GAP * rowItemCount - 1))) /
          2
      );
    }

    const left =
      centeringPadding + GAP * horizontalIndex + tileWidth * horizontalIndex;

    newTilePositions.push({
      width: tileWidth,
      height: tileHeight,
      x: left,
      y: top,
      zIndex: 0,
    });
  }

  return newTilePositions;
}

function reorderTiles(tiles) {
  const focusedTiles = [];
  const presenterTiles = [];
  const otherTiles = [];

  const orderedTiles = new Array(tiles.length);
  tiles.forEach((tile) => (orderedTiles[tile.order] = tile));

  orderedTiles.forEach((tile) =>
    (tile.focused
      ? focusedTiles
      : tile.presenter
      ? presenterTiles
      : otherTiles
    ).push(tile)
  );

  [...focusedTiles, ...presenterTiles, ...otherTiles].forEach(
    (tile, i) => (tile.order = i)
  );
}

export function VideoGrid({ items, layout, disableAnimations, children }) {
  // Place the PiP in the bottom right corner by default
  const [pipXRatio, setPipXRatio] = useState(1);
  const [pipYRatio, setPipYRatio] = useState(1);

  const [{ tiles, tilePositions }, setTileState] = useState({
    tiles: [],
    tilePositions: [],
  });
  const [scrollPosition, setScrollPosition] = useState(0);
  const draggingTileRef = useRef(null);
  const lastTappedRef = useRef({});
  const lastLayoutRef = useRef(layout);
  const isMounted = useIsMounted();

  const [gridRef, gridBounds] = useMeasure({ polyfill: ResizeObserver });

  useEffect(() => {
    setTileState(({ tiles, ...rest }) => {
      const newTiles = [];
      const removedTileKeys = new Set();

      for (const tile of tiles) {
        let item = items.find((item) => item.id === tile.key);

        let remove = false;

        if (!item) {
          remove = true;
          item = tile.item;
          removedTileKeys.add(tile.key);
        }

        let focused;
        let presenter = false;

        if (layout === "spotlight") {
          focused = item.focused;
          presenter = item.presenter;
        } else {
          focused = layout === lastLayoutRef.current ? tile.focused : false;
        }

        newTiles.push({
          key: item.id,
          order: tile.order,
          item,
          remove,
          focused,
          presenter,
        });
      }

      for (const item of items) {
        const existingTileIndex = newTiles.findIndex(
          ({ key }) => item.id === key
        );

        const existingTile = newTiles[existingTileIndex];

        if (existingTile && !existingTile.remove) {
          continue;
        }

        const newTile = {
          key: item.id,
          order: existingTile?.order ?? newTiles.length,
          item,
          remove: false,
          focused: layout === "spotlight" && item.focused,
          presenter: layout === "spotlight" && item.presenter,
        };

        if (existingTile) {
          // Replace an existing tile
          newTiles.splice(existingTileIndex, 1, newTile);
        } else {
          // Added tiles
          newTiles.push(newTile);
        }
      }

      reorderTiles(newTiles);

      if (removedTileKeys.size > 0) {
        setTimeout(() => {
          if (!isMounted.current) {
            return;
          }

          setTileState(({ tiles, ...rest }) => {
            const newTiles = tiles
              .filter((tile) => !removedTileKeys.has(tile.key))
              .map((tile) => ({ ...tile })); // clone before reordering
            reorderTiles(newTiles);

            const presenterTileCount = newTiles.reduce(
              (count, tile) => count + (tile.focused ? 1 : 0),
              0
            );

            return {
              ...rest,
              tiles: newTiles,
              tilePositions: getTilePositions(
                newTiles.length,
                presenterTileCount,
                gridBounds.width,
                gridBounds.height,
                pipXRatio,
                pipYRatio,
                layout
              ),
            };
          });
        }, 250);
      }

      const presenterTileCount = newTiles.reduce(
        (count, tile) => count + (tile.focused ? 1 : 0),
        0
      );

      lastLayoutRef.current = layout;

      return {
        ...rest,
        tiles: newTiles,
        tilePositions: getTilePositions(
          newTiles.length,
          presenterTileCount,
          gridBounds.width,
          gridBounds.height,
          pipXRatio,
          pipYRatio,
          layout
        ),
      };
    });
  }, [items, gridBounds, layout, isMounted, pipXRatio, pipYRatio]);

  const animate = useCallback(
    (tiles) => (tileIndex) => {
      const tile = tiles[tileIndex];
      const tilePosition = tilePositions[tile.order];
      const draggingTile = draggingTileRef.current;
      const dragging = draggingTile && tile.key === draggingTile.key;
      const remove = tile.remove;

      if (dragging) {
        return {
          width: tilePosition.width,
          height: tilePosition.height,
          x: draggingTile.offsetX + draggingTile.x,
          y: draggingTile.offsetY + draggingTile.y,
          scale: 1.1,
          opacity: 1,
          zIndex: 2,
          shadow: 15,
          immediate: (key) =>
            disableAnimations ||
            key === "zIndex" ||
            key === "x" ||
            key === "y" ||
            key === "shadow",
          from: {
            shadow: 0,
            scale: 0,
            opacity: 0,
          },
          reset: false,
        };
      } else {
        const isMobile = isMobileBreakpoint(
          gridBounds.width,
          gridBounds.height
        );

        return {
          x:
            tilePosition.x +
            (layout === "spotlight" && tileIndex !== 0 && isMobile
              ? scrollPosition
              : 0),
          y:
            tilePosition.y +
            (layout === "spotlight" && tileIndex !== 0 && !isMobile
              ? scrollPosition
              : 0),
          width: tilePosition.width,
          height: tilePosition.height,
          scale: remove ? 0 : 1,
          opacity: remove ? 0 : 1,
          zIndex: tilePosition.zIndex,
          shadow: 1,
          from: {
            shadow: 1,
            scale: 0,
            opacity: 0,
          },
          reset: false,
          immediate: (key) =>
            disableAnimations || key === "zIndex" || key === "shadow",
          // If we just stopped dragging a tile, give it time for its animation
          // to settle before pushing its z-index back down
          delay: (key) => (key === "zIndex" ? 500 : 0),
        };
      }
    },
    [tilePositions, disableAnimations, scrollPosition, layout, gridBounds]
  );

  const [springs, api] = useSprings(tiles.length, animate(tiles), [
    tilePositions,
    tiles,
    scrollPosition,
  ]);

  const onTap = useCallback(
    (tileKey) => {
      const lastTapped = lastTappedRef.current[tileKey];

      if (!lastTapped || Date.now() - lastTapped > 500) {
        lastTappedRef.current[tileKey] = Date.now();
        return;
      }

      lastTappedRef.current[tileKey] = 0;

      const tile = tiles.find((tile) => tile.key === tileKey);
      if (!tile || layout !== "freedom") return;
      const item = tile.item;

      setTileState(({ tiles, ...state }) => {
        let presenterTileCount = 0;
        const newTiles = tiles.map((tile) => {
          let newTile = { ...tile }; // clone before reordering

          if (tile.item === item) {
            newTile.focused = !tile.focused;
          }
          if (newTile.focused) {
            presenterTileCount++;
          }

          return newTile;
        });

        reorderTiles(newTiles);

        return {
          ...state,
          tiles: newTiles,
          tilePositions: getTilePositions(
            newTiles.length,
            presenterTileCount,
            gridBounds.width,
            gridBounds.height,
            pipXRatio,
            pipYRatio,
            layout
          ),
        };
      });
    },
    [tiles, gridBounds, layout]
  );

  const bindTile = useDrag(
    ({ args: [key], active, xy, movement, tap, last, event }) => {
      event.preventDefault();

      if (tap) {
        onTap(key);
        return;
      }

      if (layout !== "freedom") return;

      const dragTileIndex = tiles.findIndex((tile) => tile.key === key);
      const dragTile = tiles[dragTileIndex];
      const dragTilePosition = tilePositions[dragTile.order];

      const cursorPosition = [xy[0] - gridBounds.left, xy[1] - gridBounds.top];

      let newTiles = tiles;

      if (tiles.length === 2) {
        // We're in 1:1 mode, so only the local tile should be draggable
        if (!dragTile.item.isLocal) return;

        // Position should only update on the very last event, to avoid
        // compounding the offset on every drag event
        if (last) {
          const remotePosition = tilePositions[1];

          const pipGap = getPipGap(gridBounds.width / gridBounds.height);
          const pipMinX = remotePosition.x + pipGap;
          const pipMinY = remotePosition.y + pipGap;
          const pipMaxX =
            remotePosition.x +
            remotePosition.width -
            dragTilePosition.width -
            pipGap;
          const pipMaxY =
            remotePosition.y +
            remotePosition.height -
            dragTilePosition.height -
            pipGap;

          const newPipXRatio =
            (dragTilePosition.x + movement[0] - pipMinX) / (pipMaxX - pipMinX);
          const newPipYRatio =
            (dragTilePosition.y + movement[1] - pipMinY) / (pipMaxY - pipMinY);

          setPipXRatio(Math.max(0, Math.min(1, newPipXRatio)));
          setPipYRatio(Math.max(0, Math.min(1, newPipYRatio)));
        }
      } else {
        const hoverTile = tiles.find(
          (tile) =>
            tile.key !== key &&
            isInside(cursorPosition, tilePositions[tile.order])
        );

        if (hoverTile) {
          // Shift the tiles into their new order
          newTiles = newTiles.map((tile) => {
            let order = tile.order;
            if (order < dragTile.order) {
              if (order >= hoverTile.order) order++;
            } else if (order > dragTile.order) {
              if (order <= hoverTile.order) order--;
            } else {
              order = hoverTile.order;
            }

            let focused;
            if (tile === hoverTile) {
              focused = dragTile.focused;
            } else if (tile === dragTile) {
              focused = hoverTile.focused;
            } else {
              focused = tile.focused;
            }

            return { ...tile, order, focused };
          });

          reorderTiles(newTiles);

          setTileState((state) => ({ ...state, tiles: newTiles }));
        }
      }

      if (active) {
        if (!draggingTileRef.current) {
          draggingTileRef.current = {
            key: dragTile.key,
            offsetX: dragTilePosition.x,
            offsetY: dragTilePosition.y,
            x: movement[0],
            y: movement[1],
          };
        } else {
          draggingTileRef.current.x = movement[0];
          draggingTileRef.current.y = movement[1];
        }
      } else {
        draggingTileRef.current = null;
      }

      api.start(animate(newTiles));
    },
    { filterTaps: true, pointer: { buttons: [1] } }
  );

  const onGridGesture = useCallback(
    (e, isWheel) => {
      if (layout !== "spotlight") {
        return;
      }

      const isMobile = isMobileBreakpoint(gridBounds.width, gridBounds.height);
      let movement = e.delta[isMobile ? 0 : 1];

      if (isWheel) {
        movement = -movement;
      }

      let min = 0;

      if (tilePositions.length > 1) {
        const lastTile = tilePositions[tilePositions.length - 1];
        min = isMobile
          ? gridBounds.width - lastTile.x - lastTile.width - GAP
          : gridBounds.height - lastTile.y - lastTile.height - GAP;
      }

      setScrollPosition((scrollPosition) =>
        Math.min(Math.max(movement + scrollPosition, min), 0)
      );
    },
    [layout, gridBounds, tilePositions]
  );

  const bindGrid = useGesture(
    {
      onWheel: (e) => onGridGesture(e, true),
      onDrag: (e) => onGridGesture(e, false),
    },
    {}
  );

  return (
    <div className={styles.videoGrid} ref={gridRef} {...bindGrid()}>
      {springs.map(({ shadow, ...style }, i) => {
        const tile = tiles[i];
        const tilePosition = tilePositions[tile.order];

        return children({
          ...bindTile(tile.key),
          key: tile.key,
          style: {
            boxShadow: shadow.to(
              (s) => `rgba(0, 0, 0, 0.5) 0px ${s}px ${2 * s}px 0px`
            ),
            ...style,
          },
          width: tilePosition.width,
          height: tilePosition.height,
          item: tile.item,
        });
      })}
    </div>
  );
}

VideoGrid.defaultProps = {
  layout: "freedom",
};
