<?php

declare(strict_types=1);

namespace Arjun\CurrencyConverter\Controller\Index;

use Arjun\CurrencyConverter\Model\Config;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\Controller\Result\Forward;
use Magento\Framework\Controller\Result\ForwardFactory;
use Magento\Framework\Controller\ResultFactory;
use Magento\Framework\Controller\ResultInterface;

class Index implements HttpGetActionInterface
{
    public function __construct(
        private readonly Config $config,
        private readonly ForwardFactory $forwardFactory,
        private readonly ResultFactory $resultFactory
    ) {
    }

    public function execute(): ResultInterface|Forward
    {
        if (!$this->config->isEnabled()) {
            return $this->forwardFactory->create()->forward('noroute');
        }

        $page = $this->resultFactory->create(ResultFactory::TYPE_PAGE);
        $page->getConfig()->getTitle()->set(__('Currency Exchange Converter'));

        return $page;
    }
}
