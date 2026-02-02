import React, { memo, type MutableRefObject } from "react";
import { Box, Text } from "ink";
import type { Session } from "../state/types.js";
import { useTerminalRenderer } from "../hooks/use-terminal-renderer.js";

interface TerminalLineProps {
  content: string;
}

const TerminalLine = memo(function TerminalLine({ content }: TerminalLineProps) {
  return <Text>{content}</Text>;
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

  const buf = activeSession.terminal.buffer.active;
  const nonEmpty = lines.filter(l => l.replace(/\x1b\[[^m]*m/g, '').trim().length > 0).length;

  return (
    <Box flexGrow={1} flexDirection="column" overflow="hidden">
      <Text color="yellow" dimColor>
        {`[dbg] baseY=${buf.baseY} cursorY=${buf.cursorY} bufLen=${buf.length} rows=${activeSession.terminal.rows} lines=${lines.length} nonEmpty=${nonEmpty} scroll=${scrollOffset}`}
      </Text>
      {lines.map((line, i) => (
        <TerminalLine key={i} content={line} />
      ))}
    </Box>
  );
}
