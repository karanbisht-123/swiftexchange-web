import { GripHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface ResizablePanelProps {
  children: React.ReactNode;
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  className?: string;
}

const ResizablePanel: React.FC<ResizablePanelProps> = ({
  children,
  defaultHeight = 40,
  minHeight = 20,
  maxHeight = 70,
  className = '',
}) => {
  const [height, setHeight] = useState(defaultHeight);
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startYRef.current = e.clientY;
    startHeightRef.current = height;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startYRef.current = e.touches[0].clientY;
    startHeightRef.current = height;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaY = startYRef.current - e.clientY;
      const viewportHeight = window.innerHeight;
      const deltaPercent = (deltaY / viewportHeight) * 100;
      const newHeight = Math.min(
        Math.max(startHeightRef.current + deltaPercent, minHeight),
        maxHeight
      );

      setHeight(newHeight);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;

      const deltaY = startYRef.current - e.touches[0].clientY;
      const viewportHeight = window.innerHeight;
      const deltaPercent = (deltaY / viewportHeight) * 100;
      const newHeight = Math.min(
        Math.max(startHeightRef.current + deltaPercent, minHeight),
        maxHeight
      );

      setHeight(newHeight);
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
  }, [isDragging, minHeight, maxHeight]);

  return (
    <div
      ref={panelRef}
      className={`bg-secondary border-t border-gray-800 flex flex-col overflow-hidden transition-none ${className}`}
      style={{ height: `${height}vh` }}
    >
      {/* Drag Handle */}
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className={`flex items-center justify-center h-2 cursor-ns-resize hover:bg-gray-700/50 transition-colors shrink-0 group relative ${
          isDragging ? 'bg-blue-500/30' : ''
        }`}
      >
        <div
          className={`absolute inset-x-0 top-0 h-1 transition-colors ${
            isDragging ? 'bg-blue-500' : 'bg-transparent group-hover:bg-gray-600'
          }`}
        />
        <GripHorizontal
          className={`w-8 h-4 transition-colors ${
            isDragging ? 'text-blue-500' : 'text-gray-600 group-hover:text-gray-400'
          }`}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">{children}</div>
    </div>
  );
};

export default ResizablePanel;
