import React from "react";
import { Box, Text } from "ink";
import { useAppState } from "../state/session-store.js";

export const TabBar = React.memo(function TabBar() {
  const { sessions, activeSessionId } = useAppState();

  return (
    <Box flexDirection="row" height={1}>
      <Text bold color="green">
        {" hydra "}
      </Text>
      <Text color="gray">|</Text>
      {sessions.length === 0 ? (
        <Text color="gray"> no sessions (Ctrl+B, N to create)</Text>
      ) : (
        sessions.map((session, i) => {
          const isActive = session.id === activeSessionId;
          const hasExited = session.exitCode !== null;
          return (
            <React.Fragment key={session.id}>
              <Text
                color={hasExited ? "red" : isActive ? "white" : "gray"}
                backgroundColor={isActive ? "blue" : undefined}
                bold={isActive}
              >
                {` ${i + 1}:${session.branch} `}
              </Text>
              {i < sessions.length - 1 && <Text color="gray">|</Text>}
            </React.Fragment>
          );
        })
      )}
    </Box>
  );
});
