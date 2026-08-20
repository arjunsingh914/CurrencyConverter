<?php

declare(strict_types=1);

namespace Arjun\CurrencyConverter\Controller\Index;

use Arjun\CurrencyConverter\Model\Config;
use Arjun\CurrencyConverter\Model\FrankfurterClient;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\Controller\Result\Json;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Exception\LocalizedException;

class Currencies implements HttpGetActionInterface
{
    public function __construct(
        private readonly Config $config,
        private readonly JsonFactory $jsonFactory,
        private readonly FrankfurterClient $frankfurterClient
    ) {
    }

    public function execute(): Json
    {
        $result = $this->jsonFactory->create();

        if (!$this->config->isEnabled()) {
            return $result->setHttpResponseCode(403)->setData([
                'success' => false,
                'message' => __('Currency converter is disabled.'),
            ]);
        }

        try {
            return $result->setData([
                'success' => true,
                'data' => $this->frankfurterClient->getCurrencies(),
            ]);
        } catch (LocalizedException $exception) {
            return $result->setHttpResponseCode(400)->setData([
                'success' => false,
                'message' => $exception->getMessage(),
            ]);
        }
    }
}
