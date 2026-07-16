import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ message }) => (
  <div className="flex items-center justify-center h-full min-h-[150px] py-8">
    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
    <span className="ml-3 text-gray-400">{message}</span>
  </div>
);
