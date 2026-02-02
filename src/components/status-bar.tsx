import React from "react";
import { Box, Text } from "ink";
import { useAppState } from "../state/session-store.js";

export const StatusBar = React.memo(function StatusBar() {
  const { sessions, activeSessionId, mode, scrollOffset } = useAppState();
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeIndex = sessions.findIndex((s) => s.id === activeSessionId);

  let modeText = "";
  if (mode === "creating-session") modeText = " [CREATE] ";
  if (mode === "confirming-close") modeText = " [CLOSE?] ";

  return (
    <Box flexDirection="row" height={1}>
      <Text backgroundColor="gray" color="black">
        {modeText}
        {activeSession
          ? ` ${activeIndex + 1}/${sessions.length} | ${activeSession.branch} `
          : " ^B,N: new "}
      </Text>
      {scrollOffset > 0 && (
        <Text backgroundColor="yellow" color="black">
          {` [scroll: -${scrollOffset}] `}
        </Text>
      )}
      {activeSession?.exitCode !== null && activeSession?.exitCode !== undefined && (
        <Text backgroundColor="red" color="white">
          {` exited(${activeSession.exitCode}) `}
        </Text>
      )}
      <Box flexGrow={1} />
      <Text backgroundColor="gray" color="black">
        {" ^B,N:new  ^B,W:close  ^B,[/]:tabs  ^B,Q:quit "}
      </Text>
    </Box>
  );
});
