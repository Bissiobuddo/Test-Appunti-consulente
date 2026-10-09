import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";

const transformer = new Transformer();

export interface MindMapHandle {
  svg: SVGSVGElement | null;
  fit: () => void;
}

export const MindMap = forwardRef<MindMapHandle, { markdown: string }>(function MindMap({ markdown }, ref) {
  const svgRef = useRef<SVGSVGElement>(null);
  const mmRef = useRef<Markmap | null>(null);

  useImperativeHandle(ref, () => ({ svg: svgRef.current, fit: () => void mmRef.current?.fit() }), []);

  useEffect(() => {
    if (!svgRef.current) return;
    const mm = Markmap.create(svgRef.current, { autoFit: true, duration: 300, maxWidth: 220, initialExpandLevel: 3 });
    mmRef.current = mm;
    return () => {
      mm.destroy();
      mmRef.current = null;
    };
  }, []);

  useEffect(() => {
    const { root } = transformer.transform(markdown);
    void mmRef.current?.setData(root).then(() => mmRef.current?.fit());
  }, [markdown]);

  return <svg ref={svgRef} className="mindmap" />;
});
