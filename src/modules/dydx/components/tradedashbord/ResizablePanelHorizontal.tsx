import { GripVertical } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface ResizablePanelHorizontalProps {
  children: React.ReactNode;
  defaultWidth?: number; // in pixels
  minWidth?: number;
  maxWidth?: number;
  className?: string;
  position?: 'left' | 'right';
}

const ResizablePanelHorizontal: React.FC<ResizablePanelHorizontalProps> = ({
  children,
  defaultWidth = 300,
  minWidth = 200,
  maxWidth = 500,
  className = '',
  position = 'right',
}) => {
  const [width, setWidth] = useState(defaultWidth);
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.touches[0].clientX;
    startWidthRef.current = width;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX =
        position === 'left' ? startXRef.current - e.clientX : e.clientX - startXRef.current;

      const newWidth = Math.min(Math.max(startWidthRef.current + deltaX, minWidth), maxWidth);
      setWidth(newWidth);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      const deltaX =
        position === 'left'
          ? startXRef.current - e.touches[0].clientX
          : e.touches[0].clientX - startXRef.current;

      const newWidth = Math.min(Math.max(startWidthRef.current + deltaX, minWidth), maxWidth);
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, minWidth, maxWidth, position]);

  const resizer = (
    <div
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      className={`absolute top-0 bottom-0 ${position === 'left' ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2'} flex flex-col items-center justify-center w-3 cursor-ew-resize hover:bg-gray-700/50 transition-colors z-20 group ${
        isDragging ? 'bg-blue-500/30' : ''
      }`}
    >
      <div
        className={`absolute inset-y-0 w-[2px] transition-colors left-1/2 -translate-x-1/2 ${
          isDragging ? 'bg-blue-500' : 'bg-transparent group-hover:bg-gray-600'
        }`}
      />
      <GripVertical
        className={`w-3 h-8 transition-colors absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 ${
          isDragging ? 'text-blue-500' : 'text-transparent group-hover:text-gray-400'
        }`}
      />
    </div>
  );

  return (
    <div
      ref={panelRef}
      className={`flex flex-col overflow-visible relative transition-none ${className}`}
      style={{ width: `${width}px` }}
    >
      {resizer}
      <div className="flex-1 w-full h-full overflow-hidden flex flex-col">{children}</div>
    </div>
  );
};

export default ResizablePanelHorizontal;
