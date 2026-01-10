export type MarginType = 'CROSS' | 'ISOLATED';

interface MarginTypeSelectorProps {
  selected: MarginType;
  onChange: (type: MarginType) => void;
}

export const MarginTypeSelector: React.FC<MarginTypeSelectorProps> = ({ selected, onChange }) => {
  return (
    <div className="flex px-4 gap-4 text-sm">
      <label className="text-gray-400">Margin Mode</label>
      <div className="flex gap-4 ml-auto">
        <button
          onClick={() => onChange('CROSS')}
          className={`font-medium transition-colors ${selected === 'CROSS' ? 'text-white' : 'text-gray-500'
            }`}
        >
          Cross
        </button>
        <button
          onClick={() => onChange('ISOLATED')}
          className={`font-medium transition-colors ${selected === 'ISOLATED' ? 'text-white' : 'text-gray-500'
            }`}
        >
          Isolated
        </button>
      </div>
    </div>
  );
};
