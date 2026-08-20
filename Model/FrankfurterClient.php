<?php

declare(strict_types=1);

namespace Arjun\CurrencyConverter\Model;

use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\HTTP\Client\Curl;
use Magento\Framework\Serialize\Serializer\Json;
use Magento\Framework\Stdlib\DateTime\DateTime;

class FrankfurterClient
{
    public function __construct(
        private readonly Curl $curl,
        private readonly Json $json,
        private readonly DateTime $dateTime,
        private readonly string $baseUrl
    ) {
    }

    /**
     * @return array<string, string>
     */
    public function getCurrencies(): array
    {
        $response = $this->request('/currencies');
        $currencies = [];

        foreach ($response as $code => $currency) {
            if (is_array($currency) && isset($currency['iso_code'], $currency['name'])) {
                $currencies[(string)$currency['iso_code']] = (string)$currency['name'];
                continue;
            }

            if (is_string($code) && is_string($currency)) {
                $currencies[$code] = $currency;
            }
        }

        asort($currencies);

        return $currencies;
    }

    /**
     * @return array{from: string, to: string, date: string, rate: float}
     */
    public function getCurrentRate(string $from, string $to): array
    {
        $this->validatePair($from, $to);

        if ($from === $to) {
            return [
                'from' => $from,
                'to' => $to,
                'date' => gmdate('Y-m-d', (int)$this->dateTime->gmtTimestamp()),
                'rate' => 1.0,
            ];
        }

        $response = $this->request(sprintf('/rate/%s/%s', rawurlencode($from), rawurlencode($to)));

        if (!isset($response['rate'])) {
            throw new LocalizedException(__('No current rate was returned for %1 to %2.', $from, $to));
        }

        return [
            'from' => (string)($response['base'] ?? $from),
            'to' => (string)($response['quote'] ?? $to),
            'date' => (string)($response['date'] ?? ''),
            'rate' => (float)$response['rate'],
        ];
    }

    /**
     * @return array{from: string, to: string, start_date: string, end_date: string, points: array<int, array{date: string, rate: float}>}
     */
    public function getHistoricalRates(string $from, string $to, int $days = 30): array
    {
        $this->validatePair($from, $to);
        $days = max(7, min($days, 365));
        $endTimestamp = (int)$this->dateTime->gmtTimestamp();
        $startTimestamp = strtotime(sprintf('-%d days', $days), $endTimestamp);
        $startDate = gmdate('Y-m-d', (int)$startTimestamp);
        $endDate = gmdate('Y-m-d', $endTimestamp);

        if ($from === $to) {
            return [
                'from' => $from,
                'to' => $to,
                'start_date' => $startDate,
                'end_date' => $endDate,
                'points' => $this->getIdentityRatePoints($startTimestamp, $endTimestamp),
            ];
        }

        $response = $this->request('/rates', [
            'from' => $startDate,
            'to' => $endDate,
            'base' => $from,
            'quotes' => $to,
        ]);

        $points = [];
        foreach ($response as $rate) {
            if (is_array($rate) && isset($rate['date'], $rate['rate'])) {
                $points[] = [
                    'date' => (string)$rate['date'],
                    'rate' => (float)$rate['rate'],
                ];
            }
        }

        usort($points, static fn (array $a, array $b): int => strcmp($a['date'], $b['date']));

        return [
            'from' => $from,
            'to' => $to,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'points' => $points,
        ];
    }

    /**
     * @param array<string, string|int> $params
     * @return array<mixed>
     */
    private function request(string $path, array $params = []): array
    {
        $url = rtrim($this->baseUrl, '/') . $path;
        if ($params) {
            $url .= '?' . http_build_query($params);
        }

        $this->curl->addHeader('Accept', 'application/json');
        $this->curl->setTimeout(10);
        $this->curl->get($url);

        if ($this->curl->getStatus() < 200 || $this->curl->getStatus() >= 300) {
            throw new LocalizedException(__('Frankfurter request failed with HTTP %1.', $this->curl->getStatus()));
        }

        try {
            $data = $this->json->unserialize($this->curl->getBody());
        } catch (\InvalidArgumentException $exception) {
            throw new LocalizedException(__('Frankfurter returned an invalid JSON response.'));
        }

        if (!is_array($data)) {
            throw new LocalizedException(__('Frankfurter returned an unexpected response.'));
        }

        return $data;
    }

    private function validatePair(string $from, string $to): void
    {
        if (!preg_match('/^[A-Z]{3}$/', $from) || !preg_match('/^[A-Z]{3}$/', $to)) {
            throw new LocalizedException(__('Please select valid three-letter currency codes.'));
        }
    }

    /**
     * @return array<int, array{date: string, rate: float}>
     */
    private function getIdentityRatePoints(int $startTimestamp, int $endTimestamp): array
    {
        $points = [];
        for ($timestamp = $startTimestamp; $timestamp <= $endTimestamp; $timestamp += 86400) {
            $points[] = [
                'date' => gmdate('Y-m-d', $timestamp),
                'rate' => 1.0,
            ];
        }

        return $points;
    }
}
