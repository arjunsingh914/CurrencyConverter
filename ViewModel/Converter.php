<?php

declare(strict_types=1);

namespace Arjun\CurrencyConverter\ViewModel;

use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;

class Converter implements ArgumentInterface
{
    public function __construct(
        private readonly UrlInterface $urlBuilder
    ) {
    }

    public function getRateUrl(): string
    {
        return $this->urlBuilder->getUrl('currency_converter/index/rate');
    }

    public function getCurrenciesUrl(): string
    {
        return $this->urlBuilder->getUrl('currency_converter/index/currencies');
    }

    public function getHistoryUrl(): string
    {
        return $this->urlBuilder->getUrl('currency_converter/index/history');
    }
}
