import { CheckCircle, Loader2 } from 'lucide-react';
import React from 'react';

interface SwapFlowAnimationProps {
  currentStep: string;
}

const SwapFlowAnimation: React.FC<SwapFlowAnimationProps> = ({ currentStep }) => {
  const steps = [
    {
      id: 'weth-usdt',
      label: 'WETH → USDT',
      description: 'Swapping tokens',
      activeSteps: [
        'preparing_approval',
        'signing_approval',
        'executing_approval',
        'preparing_swap',
        'signing_swap',
        'executing_swap',
      ],
    },
    {
      id: 'usdt-usdc',
      label: 'USDT → USDC',
      description: 'Bridge conversion',
      activeSteps: ['preparing_bridge'],
    },
    {
      id: 'usdc-wallet',
      label: 'USDC → Wallet',
      description: 'Transfer complete',
      activeSteps: ['executing_bridge', 'completed'],
    },
  ];

  const getStepStatus = (step: (typeof steps)[0]) => {
    if (step.activeSteps.includes(currentStep)) {
      return 'active';
    }

    const currentStepIndex = steps.findIndex(s => s.activeSteps.includes(currentStep));
    const stepIndex = steps.findIndex(s => s.id === step.id);

    if (currentStepIndex > stepIndex) {
      return 'completed';
    }

    return 'pending';
  };

  const isAnyStepActive = steps.some(step => step.activeSteps.includes(currentStep));

  if (!isAnyStepActive) {
    return null;
  }

  // Calculate progress percentage
  const calculateProgress = () => {
    if (currentStep === 'completed') return 100;

    const activeStepIndex = steps.findIndex(step => step.activeSteps.includes(currentStep));

    if (activeStepIndex === -1) return 0;

    // Calculate progress within the current step group
    const currentStepGroup = steps[activeStepIndex].activeSteps;
    const stepProgress = (currentStepGroup.indexOf(currentStep) + 1) / currentStepGroup.length;

    // Overall progress
    return ((activeStepIndex + stepProgress) / steps.length) * 100;
  };

  const progress = calculateProgress();

  return (
    <div className="w-full">
      <div className="flex items-center justify-between relative mb-4">
        {/* Progress line */}
        <div className="absolute top-4 left-10 right-10 h-1.5 bg-gray-100 -translate-y-1/2 z-0 rounded-full">
          <div
            className="h-1.5 bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-700 ease-out rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>

        {steps.map((step, _) => {
          const status = getStepStatus(step);
          // const isFirstStep = index === 0;
          // const isLastStep = index === steps.length - 1;

          return (
            <div key={step.id} className="flex flex-col items-center relative z-10 flex-1">
              {/* Step Circle */}
              <div
                className={`
                  relative w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300
                  ${
                    status === 'completed'
                      ? 'bg-green-500 shadow-sm'
                      : status === 'active'
                        ? 'bg-blue-500 shadow-md scale-110'
                        : 'bg-gray-100'
                  }
                `}
              >
                {status === 'completed' ? (
                  <CheckCircle className="w-4 h-4 text-white" />
                ) : status === 'active' ? (
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                ) : (
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                )}

                {/* Pulse Animation for Active Step */}
                {status === 'active' && (
                  <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-40" />
                )}
              </div>

              {/* Step Label */}
              <div className="text-center mt-2 max-w-[120px]">
                <div
                  className={`
                    text-xs font-medium transition-colors duration-300
                    ${
                      status === 'completed'
                        ? 'text-green-700'
                        : status === 'active'
                          ? 'text-blue-700 font-semibold'
                          : 'text-gray-500'
                    }
                  `}
                >
                  {step.label}
                </div>
                <div
                  className={`
                    text-xs transition-colors duration-300 mt-0.5
                    ${
                      status === 'completed'
                        ? 'text-green-600'
                        : status === 'active'
                          ? 'text-blue-600'
                          : 'text-gray-400'
                    }
                  `}
                >
                  {status === 'completed'
                    ? 'Complete'
                    : status === 'active'
                      ? step.description
                      : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Current Action Text */}
      {/* <div className="text-center pt-2">
        <div className="text-sm font-medium text-gray-700 bg-blue-50 py-2 px-4 rounded-lg inline-block">
          {currentStep === 'preparing_approval' && 'Preparing token approval...'}
          {currentStep === 'signing_approval' && 'Please sign approval transaction...'}
          {currentStep === 'executing_approval' && 'Executing approval...'}
          {currentStep === 'preparing_swap' && 'Preparing swap transaction...'}
          {currentStep === 'signing_swap' && 'Please sign swap transaction...'}
          {currentStep === 'executing_swap' && 'Executing swap...'}
          {currentStep === 'preparing_bridge' && 'Preparing bridge transfer...'}
          {currentStep === 'executing_bridge' && 'Executing bridge transfer...'}
          {currentStep === 'completed' && 'Transaction completed successfully! 🎉'}
        </div>
      </div> */}

      {/* Progress percentage (optional) */}
      {/* {currentStep !== 'completed' && (
        <div className="text-center mt-3">
          <span className="text-xs text-gray-500 font-medium">
            {Math.round(progress)}% complete
          </span>
        </div>
      )} */}
    </div>
  );
};

export default SwapFlowAnimation;
