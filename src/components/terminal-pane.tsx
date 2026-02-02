import React, { memo, type MutableRefObject } from "react";
import { Box, Text } from "ink";
import type { Session } from "../state/types.js";
import { useTerminalRenderer } from "../hooks/use-terminal-renderer.js";

interface TerminalLineProps {
  content: string;
}

const TerminalLine = memo(function TerminalLine({ content }: TerminalLineProps) {
  return (
    <Box height={1} overflow="hidden">
      <Text>{content}</Text>
    </Box>
  );
});

interface TerminalPaneProps {
  notifyDirtyRef: MutableRefObject<() => void>;
  visibleRows: number;
  activeSession: Session | undefined;
  scrollOffset: number;
}

export function TerminalPane({ notifyDirtyRef, visibleRows, activeSession, scrollOffset }: TerminalPaneProps) {
  const { lines, notifyDirty } = useTerminalRenderer(activeSession, visibleRows, scrollOffset);

  // Assign synchronously in render body (not useEffect) to avoid stale-ref race on tab switch
  notifyDirtyRef.current = notifyDirty;

  if (!activeSession) {
    return (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <Text color="gray">No active session. Press Ctrl+B, N to create one.</Text>
      </Box>
    );
  }

  return (
    <Box flexGrow={1} flexDirection="column" overflow="hidden">
      {lines.map((line, i) => (
        <TerminalLine key={i} content={line} />
      ))}
    </Box>
  );
}
