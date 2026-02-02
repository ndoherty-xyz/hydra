import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface SessionCreatorProps {
  onSubmit: (branch: string) => void;
  onCancel: () => void;
}

export function SessionCreator({ onSubmit, onCancel }: SessionCreatorProps) {
  const [value, setValue] = useState("");

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        onSubmit(trimmed);
      }
      return;
    }
    if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setValue((v) => v + input);
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
      paddingX={1}
    >
      <Text bold color="green">
        New Session
      </Text>
      <Box>
        <Text>Branch name: </Text>
        <Text color="cyan">{value}</Text>
        <Text color="gray">|</Text>
      </Box>
      <Text color="gray">Enter to create, Esc to cancel</Text>
    </Box>
  );
}
