interface WalletConnectPromptProps {
  title?: string;
  description?: string;
}

export const WalletConnectPrompt: React.FC<WalletConnectPromptProps> = ({
  title = 'Connect Your Wallet',
  description = 'Connect to view your data',
}) => (
  <div className="flex flex-col items-center justify-center h-full min-h-[150px] py-8 text-center">
    <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
    <p className="text-gray-400 text-sm">{description}</p>
  </div>
);
