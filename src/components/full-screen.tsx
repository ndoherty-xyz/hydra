import React, { useEffect, useState, type ReactNode } from "react";
import { Box } from "ink";

interface FullScreenProps {
  children: ReactNode;
}

export function FullScreen({ children }: FullScreenProps) {
  const [dimensions, setDimensions] = useState({
    columns: process.stdout.columns,
    rows: process.stdout.rows,
  });

  useEffect(() => {
    // Enter alternate screen buffer
    process.stdout.write("\x1b[?1049h");
    // Hide cursor
    process.stdout.write("\x1b[?25l");

    const onResize = () => {
      setDimensions({
        columns: process.stdout.columns,
        rows: process.stdout.rows,
      });
    };

    process.stdout.on("resize", onResize);

    return () => {
      process.stdout.removeListener("resize", onResize);
      // Show cursor
      process.stdout.write("\x1b[?25h");
      // Leave alternate screen buffer
      process.stdout.write("\x1b[?1049l");
    };
  }, []);

  return (
    <Box
      flexDirection="column"
      width={dimensions.columns}
      height={dimensions.rows}
    >
      {children}
    </Box>
  );
}
