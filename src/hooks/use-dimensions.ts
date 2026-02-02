import { useState, useEffect } from "react";

export interface Dimensions {
  columns: number;
  rows: number;
}

export function useDimensions(): Dimensions {
  const [dimensions, setDimensions] = useState<Dimensions>({
    columns: process.stdout.columns,
    rows: process.stdout.rows,
  });

  useEffect(() => {
    const onResize = () => {
      setDimensions({
        columns: process.stdout.columns,
        rows: process.stdout.rows,
      });
    };
    process.stdout.on("resize", onResize);
    return () => {
      process.stdout.removeListener("resize", onResize);
    };
  }, []);

  return dimensions;
}
