interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, icon }) => (
  <div className="flex flex-col items-center justify-center min-h-[150px] md:min-h-[256px] py-8 text-center h-full">
    {icon && <div className="mb-4">{icon}</div>}
    <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
    <p className="text-gray-400 text-sm">{description}</p>
  </div>
);
