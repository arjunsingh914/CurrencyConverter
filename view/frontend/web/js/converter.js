define(['jquery'], function ($) {
    'use strict';

    return function (config, element) {
        var $root = $(element);
        var $amount = $root.find('[data-role="amount"]');
        var $from = $root.find('[data-role="from-currency"]');
        var $to = $root.find('[data-role="to-currency"]');
        var $days = $root.find('[data-role="history-days"]');
        var $status = $root.find('[data-role="status"]');
        var $rate = $root.find('[data-role="current-rate"]');
        var $converted = $root.find('[data-role="converted-amount"]');
        var $date = $root.find('[data-role="rate-date"]');
        var $chartRange = $root.find('[data-role="chart-range"]');
        var $chartEmpty = $root.find('[data-role="chart-empty"]');
        var $periodHigh = $root.find('[data-role="period-high"]');
        var $periodLow = $root.find('[data-role="period-low"]');
        var $averageRate = $root.find('[data-role="average-rate"]');
        var $latestRate = $root.find('[data-role="latest-rate"]');
        var $historyTable = $root.find('[data-role="history-table-body"]');
        var canvas = $root.find('[data-role="history-chart"]')[0];
        var chartContext = canvas ? canvas.getContext('2d') : null;
        var defaults = $.extend({
            from: 'USD',
            to: 'INR',
            amount: 1,
            days: 30
        }, config.defaults || {});
        var fallbackCurrencies = {
            USD: 'United States Dollar',
            EUR: 'Euro',
            GBP: 'British Pound',
            AED: 'United Arab Emirates Dirham',
            INR: 'Indian Rupee',
            JPY: 'Japanese Yen',
            CAD: 'Canadian Dollar',
            AUD: 'Australian Dollar'
        };
        var activeRate = null;
        var activeRequest = null;
        var chartPoints = [];

        function params() {
            return {
                from: $from.val(),
                to: $to.val(),
                days: $days.val(),
                amount: getAmount()
            };
        }

        function setStatus(message, isError) {
            var isLoading = !!message && !isError;

            $root.attr('aria-busy', isLoading ? 'true' : 'false');
            $('body').toggleClass('currency-converter-is-loading', isLoading);
            $status.empty()
                .toggleClass('is-error', !!isError)
                .toggleClass('is-loading', isLoading);

            if (isLoading) {
                $('<span/>', {
                    'class': 'currency-converter__loader',
                    'aria-hidden': 'true'
                }).appendTo($status);
                $('<span/>', {
                    'class': 'currency-converter__visually-hidden',
                    text: message
                }).appendTo($status);
            } else {
                $status.text(message || '');
            }
        }

        function getAmount() {
            var amount = parseFloat(String($amount.val()).replace(/,/g, ''));

            return isFinite(amount) && amount >= 0 ? amount : 0;
        }

        function formatNumber(value, digits) {
            return Number(value).toLocaleString(undefined, {
                minimumFractionDigits: digits,
                maximumFractionDigits: digits
            });
        }

        function formatMoney(value, currency) {
            return formatNumber(value, 2) + ' ' + currency;
        }

        function normalizeCurrencies(data) {
            var currencies = {};

            if ($.isArray(data)) {
                $.each(data, function (_, item) {
                    if (typeof item === 'string') {
                        currencies[item] = item;
                    } else if (item && item.code) {
                        currencies[String(item.code).toUpperCase()] = item.name || item.label || item.code;
                    }
                });

                return currencies;
            }

            $.each(data || {}, function (code, name) {
                if (typeof name === 'object' && name !== null) {
                    currencies[String(code).toUpperCase()] = name.name || name.label || code;
                    return;
                }

                currencies[String(code).toUpperCase()] = name || code;
            });

            return currencies;
        }

        function fetchJson(url, data) {
            if (!url) {
                return $.Deferred().reject('Unable to load exchange data.').promise();
            }

            return $.ajax({
                url: url,
                data: data,
                dataType: 'json',
                method: 'GET'
            }).then(function (response) {
                if (response && response.success === false) {
                    return $.Deferred().reject(response.message || 'Unable to load exchange data.').promise();
                }

                if (response && response.success === true) {
                    return response.data;
                }

                return response && response.data ? response.data : response;
            }, function (xhr) {
                var message = 'Unable to load exchange data.';

                if (xhr && xhr.responseJSON && xhr.responseJSON.message) {
                    message = xhr.responseJSON.message;
                } else if (xhr && xhr.responseText) {
                    try {
                        message = JSON.parse(xhr.responseText).message || message;
                    } catch (exception) {
                        message = xhr.statusText || message;
                    }
                } else if (xhr && xhr.statusText) {
                    message = xhr.statusText;
                }

                return $.Deferred().reject(message).promise();
            });
        }

        function buildOptions(currencies) {
            var normalized = normalizeCurrencies(currencies);
            var codes = Object.keys(normalized).sort();
            var from = normalized[defaults.from] ? defaults.from : codes[0];
            var to = normalized[defaults.to] && defaults.to !== from ? defaults.to : codes.filter(function (code) {
                return code !== from;
            })[0];

            if (!codes.length) {
                setStatus('No currencies are available right now.', true);
                $from.prop('disabled', true);
                $to.prop('disabled', true);
                return;
            }

            $from.empty();
            $to.empty();

            $.each(codes, function (_, code) {
                var label = code + ' - ' + normalized[code];

                $('<option/>', {value: code, text: label}).appendTo($from);
                $('<option/>', {value: code, text: label}).appendTo($to);
            });

            $from.val(from);
            $to.val(to || from);
            $amount.val(defaults.amount);
            $days.val(String(defaults.days));
            $from.prop('disabled', false);
            $to.prop('disabled', false);
            load();
        }

        function loadCurrencies() {
            $from.prop('disabled', true);
            $to.prop('disabled', true);
            setStatus('Loading currencies...');

            fetchJson(config.currenciesUrl, {})
                .done(function (currencies) {
                    setStatus('');
                    buildOptions(currencies);
                })
                .fail(function () {
                    buildOptions(fallbackCurrencies);
                    setStatus('Currency list endpoint is unavailable, so a small fallback list is shown.', true);
                });
        }

        function load() {
            var request = params();
            var requestKey = [request.from, request.to, request.days].join(':');

            if (!request.from || !request.to) {
                return;
            }

            activeRequest = requestKey;
            setStatus('Loading exchange data...');

            $.when(
                fetchJson(config.rateUrl, request),
                fetchJson(config.historyUrl, request)
            ).done(function (rateData, historyData) {
                if (activeRequest !== requestKey) {
                    return;
                }

                activeRate = Number(rateData.rate);
                $rate.text('1 ' + rateData.from + ' = ' + formatNumber(activeRate, 6) + ' ' + rateData.to);
                $date.text(rateData.date || '-');
                updateConverted(rateData.to);
                drawChart(historyData.points || []);
                $chartRange.text(historyData.start_date && historyData.end_date ?
                    historyData.start_date + ' to ' + historyData.end_date :
                    '-'
                );
                setStatus('');
            }).fail(function (message) {
                if (activeRequest !== requestKey) {
                    return;
                }

                activeRate = null;
                resetSummary();
                drawChart([]);
                setStatus(String(message), true);
            });
        }

        function resetSummary() {
            $rate.text('-');
            $converted.text('-');
            $date.text('-');
            $chartRange.text('-');
        }

        function updateConverted(currency) {
            if (activeRate === null || !isFinite(activeRate)) {
                $converted.text('-');
                return;
            }

            $converted.text(formatMoney(getAmount() * activeRate, currency || $to.val()));
        }

        function setCanvasSize() {
            var ratio = window.devicePixelRatio || 1;
            var width = Math.max(320, Math.floor($(canvas).parent().width()));
            var height = Number($(canvas).attr('height')) || 320;

            canvas.style.width = '100%';
            canvas.style.height = height + 'px';
            canvas.width = Math.floor(width * ratio);
            canvas.height = Math.floor(height * ratio);
            chartContext.setTransform(ratio, 0, 0, ratio, 0, 0);

            return {
                width: width,
                height: height
            };
        }

        function drawChart(points) {
            if (!chartContext) {
                return;
            }

            points = points || [];

            var size = setCanvasSize();
            var width = size.width;
            var height = size.height;
            var padding = {top: 28, right: 24, bottom: 44, left: 68};
            var validPoints = points.filter(function (point) {
                return point && isFinite(Number(point.rate));
            });
            var rates = validPoints.map(function (point) {
                return Number(point.rate);
            });

            updateHistoryDetails(validPoints);

            chartContext.clearRect(0, 0, width, height);
            chartContext.fillStyle = '#ffffff';
            chartContext.fillRect(0, 0, width, height);
            chartPoints = points;

            if (!validPoints.length || !rates.length) {
                $chartEmpty.show();
                return;
            }

            $chartEmpty.hide();

            var min = Math.min.apply(Math, rates);
            var max = Math.max.apply(Math, rates);
            var range = max - min || 1;
            var plotWidth = width - padding.left - padding.right;
            var plotHeight = height - padding.top - padding.bottom;
            var first = validPoints[0];
            var last = validPoints[validPoints.length - 1];

            chartContext.strokeStyle = '#e5eaf2';
            chartContext.lineWidth = 1;
            for (var gridIndex = 0; gridIndex <= 4; gridIndex++) {
                var gridY = padding.top + (plotHeight / 4) * gridIndex;
                chartContext.beginPath();
                chartContext.moveTo(padding.left, gridY);
                chartContext.lineTo(width - padding.right, gridY);
                chartContext.stroke();
            }

            chartContext.fillStyle = '#69727d';
            chartContext.font = '12px Arial, sans-serif';
            chartContext.textBaseline = 'middle';
            chartContext.fillText(max.toFixed(4), 12, padding.top);
            chartContext.fillText(min.toFixed(4), 12, height - padding.bottom);
            chartContext.textBaseline = 'alphabetic';
            chartContext.fillText(first.date || '', padding.left, height - 14);
            chartContext.textAlign = 'right';
            chartContext.fillText(last.date || '', width - padding.right, height - 14);
            chartContext.textAlign = 'left';

            var gradient = chartContext.createLinearGradient(0, padding.top, 0, height - padding.bottom);
            gradient.addColorStop(0, 'rgba(37, 99, 235, .24)');
            gradient.addColorStop(1, 'rgba(37, 99, 235, .025)');
            chartContext.fillStyle = gradient;
            chartContext.beginPath();
            $.each(validPoints, function (index, point) {
                var areaRate = Number(point.rate);
                var areaX = padding.left + (validPoints.length === 1 ? 0 : (index / (validPoints.length - 1)) * plotWidth);
                var areaY = max === min ? padding.top + plotHeight / 2 : padding.top + ((max - areaRate) / range) * plotHeight;
                if (index === 0) {
                    chartContext.moveTo(areaX, height - padding.bottom);
                    chartContext.lineTo(areaX, areaY);
                } else {
                    chartContext.lineTo(areaX, areaY);
                }
            });
            chartContext.lineTo(width - padding.right, height - padding.bottom);
            chartContext.closePath();
            chartContext.fill();

            chartContext.strokeStyle = '#2563eb';
            chartContext.lineWidth = 3;
            chartContext.lineJoin = 'round';
            chartContext.lineCap = 'round';
            chartContext.beginPath();

            $.each(validPoints, function (index, point) {
                var pointRate = Number(point.rate);
                var x = padding.left + (validPoints.length === 1 ? 0 : (index / (validPoints.length - 1)) * plotWidth);
                var y = max === min ? padding.top + plotHeight / 2 : padding.top + ((max - pointRate) / range) * plotHeight;

                if (index === 0) {
                    chartContext.moveTo(x, y);
                    return;
                }

                chartContext.lineTo(x, y);
            });

            chartContext.stroke();

            if (validPoints.length === 1) {
                chartContext.fillStyle = '#0a6ece';
                chartContext.beginPath();
                chartContext.arc(padding.left, padding.top + plotHeight / 2, 4, 0, Math.PI * 2);
                chartContext.fill();
            }
        }

        function updateHistoryDetails(points) {
            var rates = points.map(function (point) {
                return Number(point.rate);
            });

            $historyTable.empty();
            $.each(points, function (_, point) {
                $('<tr/>')
                    .append($('<td/>', {text: point.date || '-'}))
                    .append($('<td/>', {text: formatNumber(Number(point.rate), 6)}))
                    .appendTo($historyTable);
            });

            if (!rates.length) {
                $periodHigh.add($periodLow).add($averageRate).add($latestRate).text('-');
                return;
            }

            var high = Math.max.apply(Math, rates);
            var low = Math.min.apply(Math, rates);
            var average = rates.reduce(function (total, value) {
                return total + value;
            }, 0) / rates.length;

            $periodHigh.text(formatNumber(high, 4));
            $periodLow.text(formatNumber(low, 4));
            $averageRate.text(formatNumber(average, 4));
            $latestRate.text(formatNumber(rates[rates.length - 1], 4));
        }

        $root.find('[data-role="swap-currencies"]').on('click', function () {
            var from = $from.val();

            $from.val($to.val());
            $to.val(from);
            load();
        });

        $root.find('[data-role="quick-amount"]').on('click', function () {
            $amount.val($(this).data('amount')).trigger('input');
        });

        $root.find('[data-role="refresh-rates"]').on('click', load);

        $root.on('change', 'select', load);
        $amount.on('input', function () {
            updateConverted($to.val());
        });
        $(window).on('resize.currencyConverter', function () {
            drawChart(chartPoints);
        });

        loadCurrencies();
    };
});
