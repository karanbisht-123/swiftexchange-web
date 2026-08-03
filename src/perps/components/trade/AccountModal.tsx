import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { useAsterAgent } from '../../adapters/aster/hooks/useAsterAgent';
import { getDepositAssets, getWithdrawAssets, estimateWithdrawFee, submitWithdraw } from '../../adapters/aster/api/account';
import { signEVMWithdraw } from '../../adapters/aster/signer';
import { walletService } from '../../../modules/walletconnect/services/walletService';
import { switchOrAddChain } from '../../../modules/evm/utils/evmChainUtils';
import { ethers } from 'ethers';
import { ArrowRightLeft } from 'lucide-react';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'deposit' | 'withdraw' | 'transfer';
}

export const AccountModal: React.FC<AccountModalProps> = ({ isOpen, onClose, initialTab = 'deposit' }) => {
  const { asterSigner, userAddr } = useAsterAgent();
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'transfer'>(initialTab);

  const [assets, setAssets] = useState<any[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [selectedChainId, setSelectedChainId] = useState<number>(56);
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [withdrawFee, setWithdrawFee] = useState<any>(null);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    setAmount('');
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    const fetchAssets = async () => {
      try {
        const res = activeTab === 'withdraw'
          ? await getWithdrawAssets(String(selectedChainId), 'perp', 'EVM')
          : await getDepositAssets(String(selectedChainId), 'perp', 'EVM');

        setAssets(res);
        if (res.length > 0) {
          // Keep current asset if it exists in new chain, otherwise pick first
          const exists = selectedAsset && res.find((a: any) => a.name === selectedAsset.name);
          if (!exists) setSelectedAsset(res[0]);
        } else {
          setSelectedAsset(null);
        }
      } catch (err) {
        console.error('Failed to fetch assets:', err);
      }
    };
    fetchAssets();
  }, [activeTab, isOpen, selectedChainId]); // re-fetch when chain changes

  useEffect(() => {
    if (activeTab === 'withdraw' && selectedAsset) {
      estimateWithdrawFee(selectedAsset.chainId || selectedChainId, selectedAsset.name, 'perp', 'EVM')
        .then(setWithdrawFee)
        .catch(console.error);
    }
  }, [activeTab, selectedAsset, selectedChainId]);

  const handleNetworkChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newChainId = Number(e.target.value);
    setSelectedChainId(newChainId);
    try {
      const provider = walletService.getProvider('evm');
      if (provider) {
        await switchOrAddChain(provider, newChainId);
      }
    } catch (err) {
      console.error('Failed to switch chain:', err);
    }
  };

  const handleDeposit = async () => {
    if (!selectedAsset || !amount) return;
    setIsLoading(true);
    try {
      const provider = walletService.getProvider('evm');
      if (!provider) throw new Error('EVM Provider not found');

      const ethersProvider = new ethers.BrowserProvider(provider as any);
      const userSigner = await ethersProvider.getSigner();

      // Basic ERC20 transfer payload (Assuming the vault is the contractAddress)
      // Note: This is an optimistic mock for a functional deposit without real ABI.
      const parsedAmount = ethers.parseUnits(amount, selectedAsset.decimals);

      const erc20Abi = ["function transfer(address to, uint256 amount) returns (bool)"];
      const tokenContract = new ethers.Contract(selectedAsset.contractAddress, erc20Abi, userSigner);

      // We would send to a real Aster Vault address, but using the token contract address as placeholder for the vault
      const tx = await tokenContract.transfer(selectedAsset.contractAddress, parsedAmount);
      await tx.wait();

      onClose();
    } catch (err) {
      console.error('Deposit failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!selectedAsset || !amount || !asterSigner || !userAddr || !withdrawFee) return;
    setIsLoading(true);
    try {
      const provider = walletService.getProvider('evm');
      if (!provider) throw new Error('EVM Provider not found');

      const ethersProvider = new ethers.BrowserProvider(provider as any);
      const userSigner = await ethersProvider.getSigner();

      const nonce = Date.now() * 1000;

      // EIP712 Signature from User Wallet
      const userSignature = await signEVMWithdraw(userSigner, selectedAsset.chainId, {
        destination: userAddr,
        destinationChain: 'ETH', // or BSC
        token: selectedAsset.name,
        amount: amount,
        fee: withdrawFee.gasCost?.toString() || '0',
        nonce: nonce,
      });

      // Submit via Agent key
      await submitWithdraw(asterSigner, userAddr, {
        chainId: selectedAsset.chainId,
        asset: selectedAsset.name,
        amount: amount,
        fee: withdrawFee.gasCost?.toString() || '0',
        receiver: userAddr,
        userNonce: String(nonce),
        userSignature,
      });

      onClose();
    } catch (err) {
      console.error('Withdraw failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Account" width="w-[420px]">
      <div className="space-y-6">
        {/* Tabs */}
        <div className="flex bg-[#111] rounded-xl p-1">
          {(['deposit', 'withdraw', 'transfer'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-[13px] font-medium rounded-lg capitalize transition-colors ${activeTab === tab ? 'bg-[#222] text-white' : 'text-secondary hover:text-white'
                }`}
            >
              {tab}
            </button>
          ))}
          <button className="px-3 text-secondary hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          </button>
        </div>

        {activeTab !== 'transfer' && (
          <div className="space-y-4">
            <select className="w-full bg-[#1A1A1A] border border-[#2B2B2B] rounded-xl px-4 py-3 text-white text-[14px] outline-none appearance-none">
              <option>Perpetual Account</option>
              <option>Spot Account</option>
            </select>

            {/* Network Selector */}
            <div className="relative">
              <select
                value={selectedChainId}
                onChange={handleNetworkChange}
                className="w-full bg-[#1A1A1A] border border-[#2B2B2B] rounded-xl px-4 py-3 text-white text-[14px] outline-none appearance-none"
              >
                <option value={1}>Ethereum</option>
                <option value={56}>BNB Smart Chain</option>
                <option value={42161}>Arbitrum One</option>
              </select>
              <svg className="absolute right-4 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>

            <div className="relative">
              <input
                type="number"
                placeholder="Amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-[#1A1A1A] border border-[#2B2B2B] rounded-xl px-4 py-3 text-white text-[14px] outline-none pr-32"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <button className="text-[#E0A865] text-[12px] font-medium hover:underline">MAX</button>
                <div className="h-4 w-px bg-[#2B2B2B] mx-1"></div>
                <div className="relative flex items-center">
                  <select
                    value={selectedAsset?.name || ''}
                    onChange={(e) => setSelectedAsset(assets.find(a => a.name === e.target.value))}
                    className="bg-transparent text-white text-[14px] outline-none appearance-none cursor-pointer pr-5 z-10"
                  >
                    {assets.length === 0 && <option value="">--</option>}
                    {assets.map(a => (
                      <option key={a.name} value={a.name} className="bg-[#1A1A1A]">{a.displayName}</option>
                    ))}
                  </select>
                  <svg className="absolute right-0 top-1/2 -translate-y-1/2 text-secondary pointer-events-none z-0" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center px-1">
              <span className="text-secondary text-[12px]">{activeTab === 'deposit' ? 'Balance' : 'Withdrawable Amount'}</span>
              <span className="text-white text-[12px]">--</span>
            </div>

            {activeTab === 'deposit' && (
              <div className="bg-[#2B1D0F] border border-[#4A3219] rounded-lg p-3 flex items-start gap-2">
                <div className="text-[#E0A865] shrink-0 mt-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                </div>
                <p className="text-[#E0A865] text-[12px] leading-relaxed">
                  Estimated deposit time for {selectedChainId === 1 ? 'Ethereum' : selectedChainId === 56 ? 'BNB Smart Chain' : 'Arbitrum'} is 5~10 minutes
                </p>
              </div>
            )}

            <button
              onClick={activeTab === 'deposit' ? handleDeposit : handleWithdraw}
              disabled={isLoading || !amount}
              className="w-full mt-2 bg-gradient-to-r from-[#EBD197] to-[#B48348] hover:opacity-90 text-black font-semibold py-3 rounded-xl transition-opacity disabled:opacity-50"
            >
              {isLoading ? 'Processing...' : (activeTab === 'deposit' ? 'Deposit' : 'Withdrawal')}
            </button>

            {activeTab === 'withdraw' && (
              <div className="text-center pt-2">
                <button className="text-[#E0A865] text-[12px] font-medium hover:underline flex items-center justify-center gap-1 mx-auto">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 3"></path><circle cx="12" cy="12" r="10"></circle></svg>
                  View History in Portfolio
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'transfer' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 bg-[#1A1A1A] border border-[#2B2B2B] rounded-xl p-3">
              <div className="flex-1 space-y-1">
                <span className="text-secondary text-[11px] block">From</span>
                <span className="text-white text-[14px]">Spot</span>
              </div>
              <button className="w-8 h-8 rounded-full bg-[#111] border border-[#2B2B2B] flex items-center justify-center hover:bg-[#222] transition-colors shrink-0">
                <ArrowRightLeft size={14} className="text-secondary" />
              </button>
              <div className="flex-1 space-y-1 text-right">
                <span className="text-secondary text-[11px] block">To</span>
                <span className="text-white text-[14px]">Perpetual</span>
              </div>
            </div>

            <div className="relative">
              <input
                type="number"
                placeholder="Amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-[#1A1A1A] border border-[#2B2B2B] rounded-xl px-4 py-3 text-white text-[14px] outline-none pr-24"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <button className="text-[#E0A865] text-[12px] font-medium hover:underline">MAX</button>
              </div>
            </div>

            <div className="flex justify-between items-center px-1">
              <span className="text-secondary text-[12px]">Transferable Amount</span>
              <span className="text-white text-[12px]">--</span>
            </div>

            <button
              className="w-full mt-2 bg-[#2B2B2B] text-[#888] font-semibold py-3 rounded-xl transition-opacity disabled:opacity-50"
              disabled
            >
              Transfer
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};
