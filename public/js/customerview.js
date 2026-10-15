/* ================================================================
   MARKETFLOW — CUSTOMER ANALYTICS
   Customer Dashboard Interactions
   ================================================================ */

(() => {
    "use strict";

    /* ============================================================
       DASHBOARD FILTERS
       ============================================================ */

    const filterForm =
        document.querySelector(".customer-filters");

    const scopeSelect =
        document.getElementById("customerScope");

    const branchSelect =
        document.getElementById("customerBranch");

    const periodSelect =
        document.getElementById("customerPeriod");

    const refreshButton =
        document.getElementById("customerRefresh");

    const updateBranchFilter = () => {
        if (!scopeSelect || !branchSelect) {
            return;
        }

        const isBranchScope =
            scopeSelect.value === "branch";

        branchSelect.disabled =
            !isBranchScope;
    };

    const submitFilters = () => {
        if (!filterForm) {
            return;
        }

        filterForm.submit();
    };

    if (scopeSelect) {
        scopeSelect.addEventListener(
            "change",
            () => {
                updateBranchFilter();

                if (
                    scopeSelect.value ===
                    "business"
                ) {
                    submitFilters();
                }
            }
        );
    }

    if (branchSelect) {
        branchSelect.addEventListener(
            "change",
            () => {
                if (
                    scopeSelect?.value ===
                        "branch" &&
                    branchSelect.value
                ) {
                    submitFilters();
                }
            }
        );
    }

    if (periodSelect) {
        periodSelect.addEventListener(
            "change",
            submitFilters
        );
    }

    if (refreshButton) {
        refreshButton.addEventListener(
            "click",
            () => {
                if (
                    refreshButton.classList.contains(
                        "is-loading"
                    )
                ) {
                    return;
                }

                refreshButton.classList.add(
                    "is-loading"
                );

                const originalText =
                    refreshButton.querySelector(
                        "span:last-child"
                    );

                if (originalText) {
                    originalText.textContent =
                        "Refreshing...";
                }

                window.setTimeout(
                    () => {
                        window.location.reload();
                    },
                    120
                );
            }
        );
    }

    updateBranchFilter();

    /* ============================================================
       ACQUISITION DATA
       ============================================================ */

    const acquisitionTrendRows =
        Array.from(
            document.querySelectorAll(
                "#customerAcquisitionTrendSource [data-period]"
            )
        ).map(row => ({
            period:
                row.dataset.period || "",
            newCustomers:
                Number(
                    row.dataset.newCustomers || 0
                )
        }));

    const branchRows =
        Array.from(
            document.querySelectorAll(
                ".customer-branch-acquisition-row"
            )
        ).map(row => ({
            element: row,
            name:
                row.dataset.branchName || "",
            newCustomers:
                Number(
                    row.dataset.newCustomers || 0
                )
        }));

    /* ============================================================
       BRANCH ACQUISITION BARS
       ============================================================ */

    const renderBranchBars = () => {
        if (!branchRows.length) {
            return;
        }

        const maximum =
            Math.max(
                ...branchRows.map(
                    row => row.newCustomers
                ),
                0
            );

        branchRows.forEach(row => {
            const fill =
                row.element.querySelector(
                    ".customer-branch-acquisition-fill"
                );

            if (!fill) {
                return;
            }

            const percentage =
                maximum > 0
                    ? (
                        row.newCustomers /
                        maximum
                    ) * 100
                    : 0;

            requestAnimationFrame(() => {
                fill.style.width =
                    `${percentage}%`;
            });
        });
    };

    renderBranchBars();

    /* ============================================================
       ACQUISITION TREND CHART
       ============================================================ */

    const chartCanvas =
        document.getElementById(
            "customerAcquisitionTrendChart"
        );

    const emptyState =
        document.getElementById(
            "customerAcquisitionTrendEmpty"
        );

    const renderAcquisitionChart = () => {
        if (!chartCanvas) {
            return;
        }

        if (
            typeof Chart ===
            "undefined"
        ) {
            return;
        }

        const hasData =
            acquisitionTrendRows.some(
                row =>
                    row.newCustomers > 0
            );

        if (!hasData) {
            chartCanvas.style.display =
                "none";

            if (emptyState) {
                emptyState.hidden =
                    false;
            }

            return;
        }

        const labels =
            acquisitionTrendRows.map(
                row =>
                    formatTrendLabel(
                        row.period
                    )
            );

        const values =
            acquisitionTrendRows.map(
                row =>
                    row.newCustomers
            );

        new Chart(
            chartCanvas,
            {
                type: "line",

                data: {
                    labels,

                    datasets: [
                        {
                            label:
                                "New Customers",

                            data:
                                values,

                            borderColor:
                                "#2563eb",

                            backgroundColor:
                                "rgba(37, 99, 235, 0.10)",

                            borderWidth: 2.5,

                            fill: true,

                            tension: 0.35,

                            pointRadius: 3,

                            pointHoverRadius: 5,

                            pointBackgroundColor:
                                "#ffffff",

                            pointBorderColor:
                                "#2563eb",

                            pointBorderWidth:
                                2
                        }
                    ]
                },

                options: {
                    responsive: true,

                    maintainAspectRatio:
                        false,

                    interaction: {
                        intersect:
                            false,

                        mode:
                            "index"
                    },

                    plugins: {
                        legend: {
                            display:
                                false
                        },

                        tooltip: {
                            backgroundColor:
                                "#12213a",

                            titleColor:
                                "#ffffff",

                            bodyColor:
                                "#ffffff",

                            padding: 11,

                            displayColors:
                                false,

                            callbacks: {
                                label:
                                    context =>
                                        `${context.parsed.y} new customers`
                            }
                        }
                    },

                    scales: {
                        x: {
                            grid: {
                                display:
                                    false
                            },

                            border: {
                                display:
                                    false
                            },

                            ticks: {
                                color:
                                    "#8a99ad",

                                font: {
                                    size:
                                        10,

                                    weight:
                                        "600"
                                },

                                maxRotation:
                                    0,

                                autoSkip:
                                    true,

                                maxTicksLimit:
                                    10
                            }
                        },

                        y: {
                            beginAtZero:
                                true,

                            border: {
                                display:
                                    false,

                                dash: [
                                    4,
                                    4
                                ]
                            },

                            grid: {
                                color:
                                    "rgba(138, 153, 173, 0.14)"
                            },

                            ticks: {
                                color:
                                    "#8a99ad",

                                font: {
                                    size:
                                        10,

                                    weight:
                                        "600"
                                },

                                precision:
                                    0
                            }
                        }
                    }
                }
            }
        );
    };

    renderAcquisitionChart();

    /* ============================================================
       TREND LABEL FORMATTER
       ============================================================ */

    function formatTrendLabel(
        value
    ) {
        if (!value) {
            return "";
        }

        const parts =
            String(value).split("-");

        if (parts.length === 3) {
            const date =
                new Date(
                    `${value}T00:00:00`
                );

            if (
                Number.isNaN(
                    date.getTime()
                )
            ) {
                return value;
            }

            return date.toLocaleDateString(
                "en-US",
                {
                    month: "short",
                    day: "numeric"
                }
            );
        }

        if (parts.length === 2) {
            const date =
                new Date(
                    `${value}-01T00:00:00`
                );

            if (
                Number.isNaN(
                    date.getTime()
                )
            ) {
                return value;
            }

            return date.toLocaleDateString(
                "en-US",
                {
                    month: "short",
                    year: "numeric"
                }
            );
        }

        return value;
    }

    document.documentElement.classList.add(
        "customer-dashboard-ready"
    );

    /* ============================================================
   CUSTOMER RETENTION
   ============================================================ */

const retentionTrendRows =
    Array.from(
        document.querySelectorAll(
            "#customerRetentionTrendSource [data-period]"
        )
    ).map(row => ({
        period:
            row.dataset.period || "",

        returningCustomers:
            Number(
                row.dataset.returning || 0
            ),

        oneTimeCustomers:
            Number(
                row.dataset.oneTime || 0
            ),

        repeatPurchaseRate:
            Number(
                row.dataset.rate || 0
            )
    }));

const retentionSummarySource =
    document.getElementById(
        "customerRetentionSummarySource"
    );

const retentionReturning =
    Number(
        retentionSummarySource?.dataset.returning ||
        0
    );

const retentionOneTime =
    Number(
        retentionSummarySource?.dataset.oneTime ||
        0
    );

const retentionTotal =
    retentionReturning +
    retentionOneTime;

const renderRetentionMix = () => {
    const returningFill =
        document.getElementById(
            "customerReturningMixFill"
        );

    const oneTimeFill =
        document.getElementById(
            "customerOneTimeMixFill"
        );

    const returningShare =
        document.getElementById(
            "customerReturningShare"
        );

    const oneTimeShare =
        document.getElementById(
            "customerOneTimeShare"
        );

    if (!retentionTotal) {
        if (returningShare) {
            returningShare.textContent =
                "0%";
        }

        if (oneTimeShare) {
            oneTimeShare.textContent =
                "0%";
        }

        return;
    }

    const returningPercentage =
        (
            retentionReturning /
            retentionTotal
        ) * 100;

    const oneTimePercentage =
        (
            retentionOneTime /
            retentionTotal
        ) * 100;

    if (returningFill) {
        requestAnimationFrame(() => {
            returningFill.style.width =
                `${returningPercentage}%`;
        });
    }

    if (oneTimeFill) {
        requestAnimationFrame(() => {
            oneTimeFill.style.width =
                `${oneTimePercentage}%`;
        });
    }

    if (returningShare) {
        returningShare.textContent =
            `${returningPercentage.toFixed(1)}%`;
    }

    if (oneTimeShare) {
        oneTimeShare.textContent =
            `${oneTimePercentage.toFixed(1)}%`;
    }
};

renderRetentionMix();

/* ============================================================
   RETENTION TREND CHART
   ============================================================ */

const retentionCanvas =
    document.getElementById(
        "customerRetentionTrendChart"
    );

const retentionEmpty =
    document.getElementById(
        "customerRetentionTrendEmpty"
    );

const renderRetentionChart = () => {
    if (!retentionCanvas) {
        return;
    }

    if (
        typeof Chart ===
        "undefined"
    ) {
        return;
    }

    const hasData =
        retentionTrendRows.some(
            row =>
                row.returningCustomers > 0 ||
                row.oneTimeCustomers > 0 ||
                row.repeatPurchaseRate > 0
        );

    if (!hasData) {
        retentionCanvas.style.display =
            "none";

        if (retentionEmpty) {
            retentionEmpty.hidden =
                false;
        }

        return;
    }

    const labels =
        retentionTrendRows.map(
            row =>
                formatTrendLabel(
                    row.period
                )
        );

    const rates =
        retentionTrendRows.map(
            row =>
                row.repeatPurchaseRate
        );

    new Chart(
        retentionCanvas,
        {
            type: "line",

            data: {
                labels,

                datasets: [
                    {
                        label:
                            "Repeat Purchase Rate",

                        data:
                            rates,

                        borderColor:
                            "#0f9f6e",

                        backgroundColor:
                            "rgba(15, 159, 110, 0.10)",

                        borderWidth: 2.5,

                        fill: true,

                        tension: 0.35,

                        pointRadius: 3,

                        pointHoverRadius: 5,

                        pointBackgroundColor:
                            "#ffffff",

                        pointBorderColor:
                            "#0f9f6e",

                        pointBorderWidth:
                            2
                    }
                ]
            },

            options: {
                responsive: true,

                maintainAspectRatio:
                    false,

                interaction: {
                    intersect:
                        false,

                    mode:
                        "index"
                },

                plugins: {
                    legend: {
                        display:
                            false
                    },

                    tooltip: {
                        backgroundColor:
                            "#12213a",

                        titleColor:
                            "#ffffff",

                        bodyColor:
                            "#ffffff",

                        padding: 11,

                        displayColors:
                            false,

                        callbacks: {
                            label:
                                context =>
                                    `${Number(
                                        context.parsed.y || 0
                                    ).toFixed(1)}% repeat purchase rate`
                        }
                    }
                },

                scales: {
                    x: {
                        grid: {
                            display:
                                false
                        },

                        border: {
                            display:
                                false
                        },

                        ticks: {
                            color:
                                "#8a99ad",

                            font: {
                                size:
                                    10,

                                weight:
                                    "600"
                            },

                            maxRotation:
                                0,

                            autoSkip:
                                true,

                            maxTicksLimit:
                                10
                        }
                    },

                    y: {
                        beginAtZero:
                            true,

                        suggestedMax:
                            100,

                        border: {
                            display:
                                false
                        },

                        grid: {
                            color:
                                "rgba(138, 153, 173, 0.14)"
                        },

                        ticks: {
                            color:
                                "#8a99ad",

                            font: {
                                size:
                                    10,

                                weight:
                                    "600"
                            },

                            callback:
                                value =>
                                    `${value}%`
                        }
                    }
                }
            }
        }
    );
};

renderRetentionChart();

/* ============================================================
   CUSTOMER SEGMENTATION
   ============================================================ */

const segmentationRows =
    Array.from(
        document.querySelectorAll(
            "#customerSegmentBreakdown .customer-segment-data"
        )
    ).map(row => ({
        name:
            row.dataset.name || "",

        key:
            row.dataset.key || "",

        count:
            Number(
                row.dataset.count || 0
            ),

        percentage:
            Number(
                row.dataset.percentage || 0
            )
    }));

const segmentationCanvas =
    document.getElementById(
        "customerSegmentationChart"
    );

const segmentationEmpty =
    document.getElementById(
        "customerSegmentationEmpty"
    );

const renderSegmentationChart = () => {
    if (!segmentationCanvas) {
        return;
    }

    if (
        typeof Chart ===
        "undefined"
    ) {
        return;
    }

    const validRows =
        segmentationRows.filter(
            row =>
                row.count > 0
        );

    if (!validRows.length) {
        segmentationCanvas.style.display =
            "none";

        if (segmentationEmpty) {
            segmentationEmpty.hidden =
                false;
        }

        return;
    }

    new Chart(
        segmentationCanvas,
        {
            type: "doughnut",

            data: {
                labels:
                    validRows.map(
                        row =>
                            row.name
                    ),

                datasets: [
                    {
                        data:
                            validRows.map(
                                row =>
                                    row.count
                            ),

                        backgroundColor: [
                            "#7c3aed",
                            "#2563eb",
                            "#0891b2",
                            "#0f9f6e",
                            "#dc2626",
                            "#64748b",
                            "#d97706"
                        ],

                        borderWidth: 3,

                        borderColor:
                            "#ffffff",

                        hoverOffset: 7
                    }
                ]
            },

            options: {
                responsive: true,

                maintainAspectRatio:
                    false,

                cutout:
                    "68%",

                plugins: {
                    legend: {
                        position:
                            "bottom",

                        labels: {
                            usePointStyle:
                                true,

                            pointStyle:
                                "circle",

                            padding:
                                15,

                            color:
                                "#526176",

                            font: {
                                size:
                                    10,

                                weight:
                                    "600"
                            }
                        }
                    },

                    tooltip: {
                        backgroundColor:
                            "#12213a",

                        titleColor:
                            "#ffffff",

                        bodyColor:
                            "#ffffff",

                        padding: 11,

                        callbacks: {
                            label:
                                context => {
                                    const row =
                                        validRows[
                                            context.dataIndex
                                        ];

                                    return `${row.count} customers (${row.percentage.toFixed(1)}%)`;
                                }
                        }
                    }
                }
            }
        }
    );
};

renderSegmentationChart();
/* ============================================================
   CUSTOMER RFM ANALYSIS
   ============================================================ */

function renderCustomerRfmChart() {
    const canvas =
        document.getElementById(
            "customerRfmChart"
        );

    if (
        !canvas ||
        typeof Chart === "undefined"
    ) {
        return;
    }

    const rows =
        Array.from(
            document.querySelectorAll(
                "#customerRfmBreakdown .customer-rfm-data"
            )
        ).map(row => ({
            key:
                row.dataset.key || "",

            name:
                row.dataset.name || "",

            count:
                Number(
                    row.dataset.count || 0
                ),

            percentage:
                Number(
                    row.dataset.percentage || 0
                )
        }));

    const validRows =
        rows.filter(
            row =>
                row.count > 0
        );

    if (!validRows.length) {
        return;
    }

    const existingChart =
        Chart.getChart(
            canvas
        );

    if (existingChart) {
        existingChart.destroy();
    }

    new Chart(
        canvas,
        {
            type: "doughnut",

            data: {
                labels:
                    validRows.map(
                        row =>
                            row.name
                    ),

                datasets: [
                    {
                        data:
                            validRows.map(
                                row =>
                                    row.count
                            ),

                        backgroundColor: [
                            "#7c3aed",
                            "#2563eb",
                            "#dc2626",
                            "#64748b",
                            "#d97706"
                        ],

                        borderWidth: 3,

                        borderColor:
                            "#ffffff",

                        hoverOffset: 6
                    }
                ]
            },

            options: {
                responsive: true,

                maintainAspectRatio:
                    false,

                cutout:
                    "68%",

                plugins: {
                    legend: {
                        position:
                            "bottom",

                        labels: {
                            usePointStyle:
                                true,

                            pointStyle:
                                "circle",

                            padding:
                                18,

                            color:
                                "#475569",

                            font: {
                                size:
                                    11,

                                weight:
                                    "600"
                            }
                        }
                    },

                    tooltip: {
                        backgroundColor:
                            "#12213a",

                        titleColor:
                            "#ffffff",

                        bodyColor:
                            "#ffffff",

                        padding: 11,

                        callbacks: {
                            label:
                                context => {
                                    const row =
                                        validRows[
                                            context.dataIndex
                                        ];

                                    return `${row.name}: ${row.count} customers (${row.percentage.toFixed(1)}%)`;
                                }
                        }
                    }
                }
            }
        }
    );
}

renderCustomerRfmChart();

/* ============================================================
   CUSTOMER LIFETIME VALUE
   ============================================================ */

function renderCustomerClvChart() {
    const canvas =
        document.getElementById(
            "customerClvChart"
        );

    if (
        !canvas ||
        typeof Chart === "undefined"
    ) {
        return;
    }

    const rows =
        Array.from(
            document.querySelectorAll(
                "#customerClvSegmentData .customer-clv-data"
            )
        ).map(row => ({
            key:
                row.dataset.key || "",

            name:
                row.dataset.name || "",

            count:
                Number(
                    row.dataset.count || 0
                ),

            revenue:
                Number(
                    row.dataset.revenue || 0
                ),

            percentage:
                Number(
                    row.dataset.percentage || 0
                )
        }));

    const validRows =
        rows.filter(
            row =>
                row.count > 0
        );

    if (!validRows.length) {
        return;
    }

    const existingChart =
        Chart.getChart(
            canvas
        );

    if (existingChart) {
        existingChart.destroy();
    }

    new Chart(
        canvas,
        {
            type: "doughnut",

            data: {
                labels:
                    validRows.map(
                        row =>
                            row.name
                    ),

                datasets: [
                    {
                        data:
                            validRows.map(
                                row =>
                                    row.count
                            ),

                        backgroundColor: [
                            "#2563eb",
                            "#94a3b8"
                        ],

                        borderWidth: 3,

                        borderColor:
                            "#ffffff",

                        hoverOffset: 6
                    }
                ]
            },

            options: {
                responsive: true,

                maintainAspectRatio:
                    false,

                cutout:
                    "68%",

                plugins: {
                    legend: {
                        position:
                            "bottom",

                        labels: {
                            usePointStyle:
                                true,

                            pointStyle:
                                "circle",

                            padding:
                                18,

                            color:
                                "#475569",

                            font: {
                                size:
                                    11,

                                weight:
                                    "600"
                            }
                        }
                    },

                    tooltip: {
                        backgroundColor:
                            "#12213a",

                        titleColor:
                            "#ffffff",

                        bodyColor:
                            "#ffffff",

                        padding: 11,

                        callbacks: {
                            label:
                                context => {
                                    const row =
                                        validRows[
                                            context.dataIndex
                                        ];

                                    return `${row.name}: ${row.count} customers (${row.percentage.toFixed(1)}%)`;
                                }
                        }
                    }
                }
            }
        }
    );
}

renderCustomerClvChart();

/* ============================================================
   CUSTOMER PROFITABILITY
   ============================================================ */

function renderCustomerProfitability() {
    const source = document.getElementById(
        "customerProfitabilitySource"
    );

    if (!source) return;

    const number = value => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const money = value =>
        number(value).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

    const integer = value =>
        Math.round(number(value)).toLocaleString();

    const revenue = number(source.dataset.revenue);
    const cogs = number(source.dataset.cogs);
    const profit = number(source.dataset.profit);
    const margin = number(source.dataset.margin);
    const profitableCustomers = number(
        source.dataset.profitableCustomers
    );
    const averageProfit = number(
        source.dataset.averageProfit
    );
    const averageOrder = number(
        source.dataset.averageOrder
    );
    const transactions = number(
        source.dataset.transactions
    );

    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };

    setText("customerProfitRevenue", money(revenue));
    setText("customerProfitCogs", money(cogs));
    setText("customerProfitGross", money(profit));
    setText("customerProfitMargin", `${margin.toFixed(1)}%`);
    setText(
        "customerProfitableCustomers",
        integer(profitableCustomers)
    );
    setText("customerAverageProfit", money(averageProfit));
    setText("customerProfitAverageOrder", money(averageOrder));
    setText("customerProfitTransactions", integer(transactions));

    document.querySelectorAll(
        "#customerProfitRankingBody [data-money]"
    ).forEach(cell => {
        cell.textContent = money(cell.dataset.money);
    });

    document.querySelectorAll(
        "#customerProfitRankingBody [data-margin]"
    ).forEach(cell => {
        cell.textContent =
            `${number(cell.dataset.margin).toFixed(1)}%`;
    });

    document.querySelectorAll(
        "#customer-profitability .customer-profit-segment-panel [data-money]"
    ).forEach(cell => {
        cell.textContent = money(cell.dataset.money);
    });

    document.querySelectorAll(
        "#customer-profitability .customer-profit-segment-panel [data-margin]"
    ).forEach(cell => {
        cell.textContent =
            `${number(cell.dataset.margin).toFixed(1)}%`;
    });

    renderCustomerProfitFinancialChart({
        revenue,
        cogs,
        profit
    });

    renderCustomerProfitDistributionChart();
}

function renderCustomerProfitFinancialChart(values) {
    const canvas = document.getElementById(
        "customerProfitFinancialChart"
    );

    if (!canvas || typeof Chart === "undefined") return;

    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    new Chart(canvas, {
        type: "bar",
        data: {
            labels: [
                "Revenue",
                "Cost of Goods Sold",
                "Gross Profit"
            ],
            datasets: [{
                label: "Amount",
                data: [
                    values.revenue,
                    values.cogs,
                    values.profit
                ],
                backgroundColor: [
                    "#2563eb",
                    "#d97706",
                    "#0f9f6e"
                ],
                borderRadius: 7,
                maxBarThickness: 64
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: context =>
                            `${context.dataset.label}: ${Number(
                                context.raw || 0
                            ).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                            })}`
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: "#64748b"
                    },
                    border: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: "#64748b",
                        callback: value =>
                            Number(value).toLocaleString()
                    },
                    grid: {
                        color: "#eef2f7"
                    },
                    border: {
                        display: false
                    }
                }
            }
        }
    });
}

function renderCustomerProfitDistributionChart() {
    const canvas = document.getElementById(
        "customerProfitDistributionChart"
    );

    if (!canvas || typeof Chart === "undefined") return;

    const rows = Array.from(
        document.querySelectorAll(
            "#customerProfitDistributionSource .customer-profit-distribution-data"
        )
    ).map(row => ({
        name: row.dataset.name || "Unnamed customer",
        profit: Number(row.dataset.profit || 0)
    }));

    const distribution = {
        "Negative profit": 0,
        "Break-even": 0,
        "Positive profit": 0
    };

    rows.forEach(row => {
        if (row.profit < 0) {
            distribution["Negative profit"]++;
        } else if (row.profit === 0) {
            distribution["Break-even"]++;
        } else {
            distribution["Positive profit"]++;
        }
    });

    const labels = Object.keys(distribution);
    const values = Object.values(distribution);

    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    new Chart(canvas, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: [
                    "#dc2626",
                    "#94a3b8",
                    "#0f9f6e"
                ],
                borderColor: "#ffffff",
                borderWidth: 3,
                hoverOffset: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "68%",
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        usePointStyle: true,
                        pointStyle: "circle",
                        padding: 16,
                        color: "#475569",
                        font: {
                            size: 11,
                            weight: "600"
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: context =>
                            `${context.label}: ${context.raw} customers`
                    }
                }
            }
        }
    });
}

renderCustomerProfitability();

/* ============================================================
   CUSTOMER PURCHASING BEHAVIOR
   ============================================================ */

function renderCustomerPurchasingBehavior() {
    const source = document.getElementById(
        "customerPurchasingSource"
    );

    if (!source) return;

    const number = value => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const money = value =>
        number(value).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

    const integer = value =>
        Math.round(number(value)).toLocaleString();

    const quantity = value =>
        number(value).toLocaleString(undefined, {
            maximumFractionDigits: 3
        });

    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };

    setText(
        "customerPurchasingCustomers",
        integer(source.dataset.customers)
    );

    setText(
        "customerPurchasingTransactions",
        integer(source.dataset.transactions)
    );

    setText(
        "customerPurchasingRevenue",
        money(source.dataset.revenue)
    );

    setText(
        "customerPurchasingQuantity",
        quantity(source.dataset.quantity)
    );

    setText(
        "customerAverageTransaction",
        money(source.dataset.averageTransaction)
    );

    setText(
        "customerAverageBasket",
        quantity(source.dataset.averageBasket)
    );

    setText(
        "customerPurchasingFrequency",
        number(source.dataset.frequency).toFixed(2)
    );

    setText(
        "customerPurchasingReturning",
        integer(source.dataset.returning)
    );

    document.querySelectorAll(
        "#customer-purchasing-behavior [data-money]"
    ).forEach(cell => {
        cell.textContent = money(cell.dataset.money);
    });

    document.querySelectorAll(
        "#customer-purchasing-behavior [data-quantity]"
    ).forEach(cell => {
        cell.textContent = quantity(cell.dataset.quantity);
    });

    renderCustomerPurchasingProductsChart();
    renderCustomerPurchasingCategoriesChart();
}

function renderCustomerPurchasingProductsChart() {
    const canvas = document.getElementById(
        "customerPurchasingProductsChart"
    );

    if (!canvas || typeof Chart === "undefined") return;

    const rows = Array.from(
        document.querySelectorAll(
            "#customerPurchasingProductSource .customer-purchasing-product-data"
        )
    ).map(row => ({
        name: row.dataset.name || "Unnamed product",
        quantity: Number(row.dataset.quantity || 0),
        revenue: Number(row.dataset.revenue || 0)
    }));

    const validRows = rows
        .filter(row =>
            Number.isFinite(row.revenue) &&
            Number.isFinite(row.quantity)
        )
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    if (!validRows.length) return;

    new Chart(canvas, {
        type: "bar",
        data: {
            labels: validRows.map(row => row.name),
            datasets: [{
                label: "Revenue",
                data: validRows.map(row => row.revenue),
                backgroundColor: "#2563eb",
                borderRadius: 6,
                maxBarThickness: 32
            }]
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: context =>
                            `Revenue: ${Number(
                                context.raw || 0
                            ).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                            })}`
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        color: "#64748b",
                        callback: value =>
                            Number(value).toLocaleString()
                    },
                    grid: {
                        color: "#eef2f7"
                    },
                    border: {
                        display: false
                    }
                },
                y: {
                    ticks: {
                        color: "#475569"
                    },
                    grid: {
                        display: false
                    },
                    border: {
                        display: false
                    }
                }
            }
        }
    });
}

function renderCustomerPurchasingCategoriesChart() {
    const canvas = document.getElementById(
        "customerPurchasingCategoriesChart"
    );

    if (!canvas || typeof Chart === "undefined") return;

    const rows = Array.from(
        document.querySelectorAll(
            "#customerPurchasingCategorySource .customer-purchasing-category-data"
        )
    ).map(row => ({
        name: row.dataset.name || "Uncategorised",
        revenue: Number(row.dataset.revenue || 0),
        quantity: Number(row.dataset.quantity || 0)
    }));

    const validRows = rows
        .filter(row =>
            Number.isFinite(row.revenue) &&
            Number.isFinite(row.quantity)
        )
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    if (!validRows.length) return;

    new Chart(canvas, {
        type: "doughnut",
        data: {
            labels: validRows.map(row => row.name),
            datasets: [{
                data: validRows.map(row => row.revenue),
                backgroundColor: [
                    "#2563eb",
                    "#0f9f6e",
                    "#7c3aed",
                    "#d97706",
                    "#0891b2",
                    "#dc2626",
                    "#64748b",
                    "#db2777",
                    "#65a30d",
                    "#9333ea"
                ],
                borderColor: "#ffffff",
                borderWidth: 3,
                hoverOffset: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "62%",
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        usePointStyle: true,
                        pointStyle: "circle",
                        padding: 14,
                        color: "#475569",
                        font: {
                            size: 11,
                            weight: "600"
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: context =>
                            `${context.label}: ${Number(
                                context.raw || 0
                            ).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                            })}`
                    }
                }
            }
        }
    });
}

renderCustomerPurchasingBehavior();

/* ============================================================
   CUSTOMER CONCENTRATION
   ============================================================ */

function renderCustomerConcentration() {
    const source = document.getElementById(
        "customerConcentrationSource"
    );

    if (!source) return;

    const number = value => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const money = value =>
        number(value).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

    const percentage = value =>
        `${number(value).toFixed(1)}%`;

    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };

    const top5Revenue = number(source.dataset.top5Revenue);
    const top5Percentage = number(source.dataset.top5Percentage);
    const top10Revenue = number(source.dataset.top10Revenue);
    const top10Percentage = number(source.dataset.top10Percentage);
    const top20Revenue = number(source.dataset.top20Revenue);
    const top20Percentage = number(source.dataset.top20Percentage);
    const totalRevenue = number(source.dataset.totalRevenue);

    setText(
        "customerConcentrationTop5Percentage",
        percentage(top5Percentage)
    );

    setText(
        "customerConcentrationTop5Revenue",
        `${money(top5Revenue)} revenue`
    );

    setText(
        "customerConcentrationTop10Percentage",
        percentage(top10Percentage)
    );

    setText(
        "customerConcentrationTop10Revenue",
        `${money(top10Revenue)} revenue`
    );

    setText(
        "customerConcentrationTop20Percentage",
        percentage(top20Percentage)
    );

    setText(
        "customerConcentrationTop20Revenue",
        `${money(top20Revenue)} revenue`
    );

    setText(
        "customerConcentrationTotalRevenue",
        money(totalRevenue)
    );

    const riskElement = document.getElementById(
        "customerConcentrationRisk"
    );

    if (riskElement) {
        let risk = "Low";

        if (top10Percentage >= 60) {
            risk = "High";
        } else if (top10Percentage >= 35) {
            risk = "Moderate";
        }

        riskElement.textContent =
            totalRevenue > 0 ? risk : "Insufficient data";

        riskElement.dataset.risk =
            totalRevenue > 0 ? risk : "";
    }

    const direction = String(
        source.dataset.direction || ""
    ).trim().toLowerCase();

    const directionElement = document.getElementById(
        "customerConcentrationDirection"
    );

    const directionIcon = document.getElementById(
        "customerConcentrationDirectionIcon"
    );

    if (directionElement) {
        let label = "Stable";

        if (
            direction === "up" ||
            direction === "increasing" ||
            direction === "↑"
        ) {
            label = "Increasing";
            directionElement.dataset.direction = "increasing";
        } else if (
            direction === "down" ||
            direction === "decreasing" ||
            direction === "↓"
        ) {
            label = "Decreasing";
            directionElement.dataset.direction = "decreasing";
        } else {
            directionElement.dataset.direction = "stable";
        }

        directionElement.textContent = label;

        if (directionIcon) {
            directionIcon.textContent =
                label === "Increasing" ? "↑" :
                label === "Decreasing" ? "↓" : "→";
        }
    }

    renderCustomerConcentrationShareChart({
        top5Percentage,
        top10Percentage,
        top20Percentage
    });

    renderCustomerConcentrationTrendChart();

    renderCustomerConcentrationRanking(totalRevenue);

    renderCustomerConcentrationInsights({
        top10Percentage,
        totalRevenue,
        direction
    });
}

function renderCustomerConcentrationShareChart(values) {
    const canvas = document.getElementById(
        "customerConcentrationShareChart"
    );

    if (!canvas || typeof Chart === "undefined") return;

    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    new Chart(canvas, {
        type: "bar",
        data: {
            labels: [
                "Top 5 Customers",
                "Top 10 Customers",
                "Top 20 Customers"
            ],
            datasets: [{
                label: "Revenue Share",
                data: [
                    values.top5Percentage,
                    values.top10Percentage,
                    values.top20Percentage
                ],
                backgroundColor: [
                    "#2563eb",
                    "#d97706",
                    "#7c3aed"
                ],
                borderRadius: 7,
                maxBarThickness: 58
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: context =>
                            `${Number(context.raw || 0).toFixed(1)}% of customer revenue`
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: "#64748b"
                    },
                    border: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        color: "#64748b",
                        callback: value => `${value}%`
                    },
                    grid: {
                        color: "#eef2f7"
                    },
                    border: {
                        display: false
                    }
                }
            }
        }
    });
}

function renderCustomerConcentrationTrendChart() {
    const canvas = document.getElementById(
        "customerConcentrationTrendChart"
    );

    if (!canvas || typeof Chart === "undefined") return;

    const rows = Array.from(
        document.querySelectorAll(
            "#customerConcentrationTrendSource .customer-concentration-trend-data"
        )
    ).map(row => ({
        period: row.dataset.period || "",
        percentage: Number(row.dataset.percentage || 0),
        revenue: Number(row.dataset.revenue || 0)
    }));

    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    if (!rows.length) return;

    new Chart(canvas, {
        type: "line",
        data: {
            labels: rows.map(row => row.period),
            datasets: [{
                label: "Top 10 Revenue Share",
                data: rows.map(row => row.percentage),
                borderColor: "#2563eb",
                backgroundColor: "rgba(37, 99, 235, 0.10)",
                fill: true,
                tension: 0.3,
                pointRadius: 3,
                pointHoverRadius: 5,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: "index"
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: context =>
                            `Top 10 share: ${Number(
                                context.raw || 0
                            ).toFixed(1)}%`
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: "#64748b",
                        maxRotation: 45,
                        minRotation: 0
                    },
                    grid: {
                        display: false
                    },
                    border: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        color: "#64748b",
                        callback: value => `${value}%`
                    },
                    grid: {
                        color: "#eef2f7"
                    },
                    border: {
                        display: false
                    }
                }
            }
        }
    });
}

function renderCustomerConcentrationRanking(totalRevenue) {
    const body = document.getElementById(
        "customerConcentrationRankingBody"
    );

    if (!body) return;

    const number = value => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const money = value =>
        number(value).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

    const rows = Array.from(body.querySelectorAll("tr"))
        .filter(row => row.hasAttribute("data-revenue"))
        .sort((a, b) =>
            number(b.dataset.revenue) -
            number(a.dataset.revenue)
        );

    let cumulativeRevenue = 0;

    rows.forEach((row, index) => {
        const revenue = number(row.dataset.revenue);
        const transactions = number(row.dataset.transactions);
        const share = totalRevenue > 0
            ? revenue / totalRevenue * 100
            : 0;

        cumulativeRevenue += revenue;

        const cumulativeShare = totalRevenue > 0
            ? cumulativeRevenue / totalRevenue * 100
            : 0;

        const rank = row.querySelector(".customer-rank-badge");
        if (rank) rank.textContent = String(index + 1);

        const cells = row.querySelectorAll("td");

        if (cells[2]) {
            cells[2].textContent =
                Math.round(transactions).toLocaleString();
        }

        if (cells[3]) {
            cells[3].textContent = money(revenue);
        }

        if (cells[4]) {
            cells[4].textContent = `${share.toFixed(1)}%`;
        }

        if (cells[5]) {
            cells[5].textContent =
                `${cumulativeShare.toFixed(1)}%`;
        }
    });
}

function renderCustomerConcentrationInsights(values) {
    const dependency = document.getElementById(
        "customerConcentrationDependency"
    );

    const dependencyMessage = document.getElementById(
        "customerConcentrationDependencyMessage"
    );

    const action = document.getElementById(
        "customerConcentrationAction"
    );

    const actionMessage = document.getElementById(
        "customerConcentrationActionMessage"
    );

    if (!dependency || !dependencyMessage || !action || !actionMessage) {
        return;
    }

    if (values.totalRevenue <= 0) {
        dependency.textContent = "Insufficient data";
        dependencyMessage.textContent =
            "There is not enough customer revenue in the selected period to assess concentration.";

        action.textContent = "Build a revenue baseline";
        actionMessage.textContent =
            "Review customer-linked completed sales and reassess concentration when sufficient activity is available.";

        return;
    }

    if (values.top10Percentage >= 60) {
        dependency.textContent = "High dependency";
        dependencyMessage.textContent =
            "The ten largest customers account for at least 60% of customer revenue. Losing a major account could materially affect revenue.";

        action.textContent = "Diversify customer revenue";
        actionMessage.textContent =
            "Strengthen major customer relationships while developing additional customers and reducing reliance on a small number of accounts.";
    } else if (values.top10Percentage >= 35) {
        dependency.textContent = "Moderate dependency";
        dependencyMessage.textContent =
            "A meaningful share of revenue comes from the ten largest customers. Monitor changes in their purchasing activity.";

        action.textContent = "Monitor major accounts";
        actionMessage.textContent =
            "Track purchasing frequency, account retention and revenue changes among your largest customers.";
    } else {
        dependency.textContent = "Lower dependency";
        dependencyMessage.textContent =
            "The ten largest customers account for less than 35% of customer revenue, indicating a more distributed revenue base.";

        action.textContent = "Maintain diversification";
        actionMessage.textContent =
            "Continue developing customer relationships and monitor concentration as the business grows.";
    }

    if (
        values.direction === "up" ||
        values.direction === "increasing" ||
        values.direction === "↑"
    ) {
        actionMessage.textContent +=
            " The concentration trend is increasing, so review the latest changes in major customer revenue.";
    } else if (
        values.direction === "down" ||
        values.direction === "decreasing" ||
        values.direction === "↓"
    ) {
        actionMessage.textContent +=
            " The concentration trend is decreasing, suggesting revenue dependency may be easing.";
    }
}

renderCustomerConcentration();

/* ============================================================
   CUSTOMER GEOGRAPHIC ANALYSIS
   ============================================================ */

function renderCustomerGeographicAnalysis() {
    const source = document.getElementById(
        "customerGeographicSource"
    );

    if (!source) return;

    const number = value => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const money = value =>
        number(value).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

    const integer = value =>
        Math.round(number(value)).toLocaleString();

    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };

    setText(
        "customerGeographicTotalCities",
        integer(source.dataset.totalCities)
    );

    setText(
        "customerGeographicTotalCustomers",
        integer(source.dataset.totalCustomers)
    );

    setText(
        "customerGeographicTotalRevenue",
        money(source.dataset.totalRevenue)
    );

    setText(
        "customerGeographicTopRevenueCity",
        source.dataset.topRevenueCity || "—"
    );

    setText(
        "customerGeographicTopCustomerCity",
        source.dataset.topCustomerCity || "—"
    );

    document.querySelectorAll(
        "#customer-geographic-analysis [data-money]"
    ).forEach(cell => {
        cell.textContent = money(cell.dataset.money);
    });

    document.querySelectorAll(
        "#customerGeographicRankingBody [data-share]"
    ).forEach(cell => {
        cell.textContent =
            `${number(cell.dataset.share).toFixed(1)}%`;
    });

    renderCustomerGeographicCustomersChart();
    renderCustomerGeographicRevenueChart();
}

function renderCustomerGeographicCustomersChart() {
    const canvas = document.getElementById(
        "customerGeographicCustomersChart"
    );

    if (!canvas || typeof Chart === "undefined") return;

    const rows = Array.from(
        document.querySelectorAll(
            "#customerGeographicRankingBody tr[data-city]"
        )
    ).map(row => ({
        city: row.dataset.city || "Unknown",
        customers: Number(row.dataset.customers || 0)
    }));

    const validRows = rows
        .filter(row =>
            Number.isFinite(row.customers) &&
            row.customers >= 0
        )
        .sort((a, b) => b.customers - a.customers)
        .slice(0, 10);

    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    if (!validRows.length) return;

    new Chart(canvas, {
        type: "bar",
        data: {
            labels: validRows.map(row => row.city),
            datasets: [{
                label: "Registered Customers",
                data: validRows.map(row => row.customers),
                backgroundColor: "#2563eb",
                borderRadius: 6,
                maxBarThickness: 34
            }]
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: context =>
                            `${Number(context.raw || 0).toLocaleString()} registered customers`
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0,
                        color: "#64748b"
                    },
                    grid: {
                        color: "#eef2f7"
                    },
                    border: {
                        display: false
                    }
                },
                y: {
                    ticks: {
                        color: "#475569"
                    },
                    grid: {
                        display: false
                    },
                    border: {
                        display: false
                    }
                }
            }
        }
    });
}

function renderCustomerGeographicRevenueChart() {
    const canvas = document.getElementById(
        "customerGeographicRevenueChart"
    );

    if (!canvas || typeof Chart === "undefined") return;

    const rows = Array.from(
        document.querySelectorAll(
            "#customerGeographicRankingBody tr[data-city]"
        )
    ).map(row => ({
        city: row.dataset.city || "Unknown",
        revenue: Number(row.dataset.revenue || 0)
    }));

    const validRows = rows
        .filter(row =>
            Number.isFinite(row.revenue) &&
            row.revenue >= 0
        )
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    if (!validRows.length) return;

    new Chart(canvas, {
        type: "bar",
        data: {
            labels: validRows.map(row => row.city),
            datasets: [{
                label: "Customer Revenue",
                data: validRows.map(row => row.revenue),
                backgroundColor: "#0f9f6e",
                borderRadius: 6,
                maxBarThickness: 34
            }]
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: context =>
                            `Revenue: ${Number(
                                context.raw || 0
                            ).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                            })}`
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        color: "#64748b",
                        callback: value =>
                            Number(value).toLocaleString()
                    },
                    grid: {
                        color: "#eef2f7"
                    },
                    border: {
                        display: false
                    }
                },
                y: {
                    ticks: {
                        color: "#475569"
                    },
                    grid: {
                        display: false
                    },
                    border: {
                        display: false
                    }
                }
            }
        }
    });
}

renderCustomerGeographicAnalysis();

})();

/* STEP 11: BRANCH ANALYSIS */
(function () {
    "use strict";

    const table = document.getElementById("customerBranchPerformanceTable");

    if (!table || typeof Chart === "undefined") return;

    const rows = Array.from(table.querySelectorAll("tbody tr"))
        .filter(row => row.querySelectorAll("td").length >= 13);

    if (!rows.length) return;

    const parseNumber = value => {
        const normalized = String(value || "")
            .replace(/,/g, "")
            .replace(/%/g, "")
            .replace(/[^\d.-]/g, "");

        const number = Number(normalized);
        return Number.isFinite(number) ? number : 0;
    };

    const branches = rows.map(row => {
        const cells = Array.from(row.querySelectorAll("td"));

        return {
            name: cells[0].querySelector(".customer-branch-name")?.textContent.trim()
                || cells[0].textContent.trim(),
            customers: parseNumber(cells[1].textContent),
            purchasingCustomers: parseNumber(cells[2].textContent),
            transactions: parseNumber(cells[6].textContent),
            revenue: parseNumber(cells[7].textContent),
            grossProfit: parseNumber(cells[8].textContent),
            repeatRate: parseNumber(cells[11].textContent),
            revenueShare: parseNumber(cells[12].textContent)
        };
    });

    const createChart = (id, config) => {
        const canvas = document.getElementById(id);

        if (!canvas) return;

        const existing = Chart.getChart(canvas);

        if (existing) existing.destroy();

        new Chart(canvas, config);
    };

    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: "bottom",
                labels: {
                    usePointStyle: true,
                    padding: 18
                }
            },
            tooltip: {
                enabled: true
            }
        }
    };

    createChart("customerBranchRevenueChart", {
        type: "bar",
        data: {
            labels: branches.map(branch => branch.name),
            datasets: [{
                label: "Revenue",
                data: branches.map(branch => branch.revenue),
                borderRadius: 6,
                maxBarThickness: 42
            }]
        },
        options: {
            ...commonOptions,
            indexAxis: "y",
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => Number(value).toLocaleString()
                    }
                }
            }
        }
    });

    createChart("customerBranchCustomerChart", {
        type: "doughnut",
        data: {
            labels: branches.map(branch => branch.name),
            datasets: [{
                label: "Registered Customers",
                data: branches.map(branch => branch.customers),
                borderWidth: 2
            }]
        },
        options: {
            ...commonOptions,
            cutout: "64%"
        }
    });

    createChart("customerBranchProfitChart", {
        type: "bar",
        data: {
            labels: branches.map(branch => branch.name),
            datasets: [
                {
                    label: "Revenue",
                    data: branches.map(branch => branch.revenue),
                    borderRadius: 5
                },
                {
                    label: "Gross Profit",
                    data: branches.map(branch => branch.grossProfit),
                    borderRadius: 5
                }
            ]
        },
        options: {
            ...commonOptions,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => Number(value).toLocaleString()
                    }
                }
            }
        }
    });

    createChart("customerBranchRetentionChart", {
        type: "bar",
        data: {
            labels: branches.map(branch => branch.name),
            datasets: [{
                label: "Repeat Purchase Rate (%)",
                data: branches.map(branch => branch.repeatRate),
                borderRadius: 5,
                maxBarThickness: 42
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: value => `${value}%`
                    }
                }
            }
        }
    });
})();

/* STEP 12: CUSTOMER 360 */
(function () {
    "use strict";

    const section = document.getElementById("customer-360");

    if (!section || typeof Chart === "undefined") return;

    const getText = selector =>
        section.querySelector(selector)?.textContent.trim() || "";

    const parseNumber = value => {
        const normalized = String(value || "")
            .replace(/,/g, "")
            .replace(/%/g, "")
            .replace(/[^\d.-]/g, "");

        const number = Number(normalized);
        return Number.isFinite(number) ? number : 0;
    };

    const createChart = (id, config) => {
        const canvas = document.getElementById(id);

        if (!canvas) return;

        const existing = Chart.getChart(canvas);

        if (existing) existing.destroy();

        new Chart(canvas, config);
    };

    const purchaseRows = Array.from(
        section.querySelectorAll(".customer-360-table tbody tr")
    ).filter(row => row.querySelectorAll("td").length >= 8);

    const monthlyPurchases = new Map();

    purchaseRows.forEach(row => {
        const cells = Array.from(row.querySelectorAll("td"));
        const rawDate = cells[0]?.textContent.trim();
        const total = parseNumber(cells[6]?.textContent);

        if (!rawDate) return;

        const date = new Date(rawDate);

        if (Number.isNaN(date.getTime())) return;

        const monthKey = [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0")
        ].join("-");

        if (!monthlyPurchases.has(monthKey)) {
            monthlyPurchases.set(monthKey, {
                transactions: 0,
                revenue: 0
            });
        }

        const month = monthlyPurchases.get(monthKey);

        month.transactions += 1;
        month.revenue += total;
    });

    const monthlyLabels = Array.from(monthlyPurchases.keys()).sort();

    const formatMonth = value => {
        const [year, month] = value.split("-").map(Number);

        return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
            month: "short",
            year: "numeric"
        });
    };

    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: "bottom",
                labels: {
                    usePointStyle: true,
                    padding: 18
                }
            }
        }
    };

    createChart("customer360PurchaseTrendChart", {
        type: "line",
        data: {
            labels: monthlyLabels.map(formatMonth),
            datasets: [{
                label: "Revenue",
                data: monthlyLabels.map(
                    month => monthlyPurchases.get(month).revenue
                ),
                borderWidth: 2,
                pointRadius: 3,
                tension: 0.3,
                fill: false,
                yAxisID: "y"
            }, {
                label: "Transactions",
                data: monthlyLabels.map(
                    month => monthlyPurchases.get(month).transactions
                ),
                borderWidth: 2,
                pointRadius: 3,
                tension: 0.3,
                fill: false,
                yAxisID: "y1"
            }]
        },
        options: {
            ...commonOptions,
            interaction: {
                mode: "index",
                intersect: false
            },
            scales: {
                y: {
                    beginAtZero: true,
                    position: "left",
                    title: {
                        display: true,
                        text: "Revenue"
                    },
                    ticks: {
                        callback: value => Number(value).toLocaleString()
                    }
                },
                y1: {
                    beginAtZero: true,
                    position: "right",
                    grid: {
                        drawOnChartArea: false
                    },
                    title: {
                        display: true,
                        text: "Transactions"
                    },
                    ticks: {
                        precision: 0
                    }
                }
            }
        }
    });

    const revenue = parseNumber(
        getText(".customer-360-kpi-card:nth-child(1) > strong")
    );

    const grossProfit = parseNumber(
        getText(".customer-360-kpi-card:nth-child(2) > strong")
    );

    const cogs = parseNumber(
        getText(".customer-360-profitability-row:nth-child(2) > strong")
    );

    createChart("customer360ProfitabilityChart", {
        type: "bar",
        data: {
            labels: ["Revenue", "Cost of Goods", "Gross Profit"],
            datasets: [{
                label: "Amount",
                data: [revenue, cogs, grossProfit],
                borderRadius: 6,
                maxBarThickness: 55
            }]
        },
        options: {
            ...commonOptions,
            plugins: {
                ...commonOptions.plugins,
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => Number(value).toLocaleString()
                    }
                }
            }
        }
    });
})();

/* STEP 13: DECISION INTELLIGENCE */
(function () {
    "use strict";

    const section = document.getElementById("customer-decision-intelligence");

    if (!section) return;

    const normalize = value =>
        String(value || "").trim().toLowerCase().replace(/\s+/g, "-");

    section.querySelectorAll(".customer-decision-direction").forEach(element => {
        const value = normalize(element.textContent);

        element.classList.remove(
            "customer-direction-up",
            "customer-direction-down",
            "customer-direction-stable",
            "customer-direction-improving",
            "customer-direction-declining",
            "customer-direction-positive",
            "customer-direction-negative",
            "customer-direction-neutral"
        );

        if (
            ["up", "increasing", "improving", "positive", "↑"].includes(value)
        ) {
            element.classList.add("customer-direction-up");
        } else if (
            ["down", "decreasing", "declining", "negative", "↓"].includes(value)
        ) {
            element.classList.add("customer-direction-down");
        } else {
            element.classList.add("customer-direction-stable");
        }
    });

    section.querySelectorAll(".customer-decision-risk-label").forEach(element => {
        const risk = normalize(element.textContent);

        element.classList.remove(
            "customer-risk-critical",
            "customer-risk-high",
            "customer-risk-medium",
            "customer-risk-low"
        );

        if (risk.includes("critical")) {
            element.classList.add("customer-risk-critical");
        } else if (risk.includes("high") || risk.includes("at-risk")) {
            element.classList.add("customer-risk-high");
        } else if (risk.includes("medium") || risk.includes("moderate")) {
            element.classList.add("customer-risk-medium");
        } else {
            element.classList.add("customer-risk-low");
        }
    });

    const watchlistTable = section.querySelector(
        ".customer-decision-watchlist-table"
    );

    if (watchlistTable) {
        const rows = Array.from(
            watchlistTable.querySelectorAll("tbody tr")
        ).filter(row => row.querySelectorAll("td").length >= 10);

        rows.forEach(row => {
            const customerName = row.cells[0]?.textContent.trim();

            if (!customerName) {
                row.classList.add("customer-decision-watchlist-empty-row");
            }
        });
    }
})();