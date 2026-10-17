// Generated from the backend motor (surco-motor@1.0.0, 20.000 runs, seed 20261017) for the PRD presets, so mock mode
// shows the same numbers as the server. Regenerate when MOTOR_VERSION changes.
import type { PresetDto } from "../dto";

export const PRESET_FIXTURES: PresetDto[] = [
  {
    "id": "P1",
    "name": "P1 · Maíz, Tolima",
    "description": "20 ha, 150 días, contrato a paridad de COP 1,05 M/t. No publicable: el comprador debe pactar un precio mayor.",
    "contract_price_per_kg": 1050
  },
  {
    "id": "P2",
    "name": "P2 · Tomate bajo invernadero",
    "description": "1 ha, 120 días, contrato a COP 1.300/kg, aporte propio del 10 %. Publicable en nivel B con ficha en COP, USD y EUR.",
    "contract_price_per_kg": 1300
  }
];

/** A sheet without its run identity (id, project_id, created_at, created_by). */
export const SHEET_FIXTURES: Record<string, Record<string, unknown>> = {
  "P1": {
    "preset": "P1",
    "motor_version": "surco-motor@1.0.0",
    "seed": 20261017,
    "runs": 20000,
    "crop": "Maíz, Tolima",
    "currency": "COP",
    "admission": {
      "passes_filters": true,
      "failed_filters": [],
      "score": 64.25,
      "level": "B",
      "milestone_range": {
        "min": 3,
        "max": 4
      },
      "labor_line": true
    },
    "capital": {
      "cost": 150000000,
      "producer_contribution": 0,
      "milestones_total": 157500000,
      "contingency": 7500000,
      "insurance_premium": 1026648,
      "fiduciary_fees": 0,
      "capital": 158526648,
      "investor_capital": 158526648,
      "integrator_capital": 0
    },
    "milestones": [
      {
        "sequence": 1,
        "title": "Preparación y siembra",
        "day": 0,
        "share_pct": 60,
        "budget": 94500000,
        "supplies": 73557000,
        "labor": 13608000,
        "fee": 2835000,
        "contingency": 4500000
      },
      {
        "sequence": 2,
        "title": "Fertilización y control",
        "day": 45,
        "share_pct": 25,
        "budget": 39375000,
        "supplies": 30648750,
        "labor": 5670000,
        "fee": 1181250,
        "contingency": 1875000
      },
      {
        "sequence": 3,
        "title": "Cosecha y poscosecha",
        "day": 110,
        "share_pct": 15,
        "budget": 23625000,
        "supplies": 18389250,
        "labor": 3402000,
        "fee": 708750,
        "contingency": 1125000
      }
    ],
    "coverage": {
      "base": 1.026,
      "stress": 0.83,
      "min_base": 1.3,
      "min_stress": 1,
      "passes": false
    },
    "breakeven": {
      "yield_kg_per_ha": 7363.8,
      "price_per_kg": 966.49,
      "safety_margin_pct": 7.95
    },
    "base_scenario": {
      "proceeds": 170460000,
      "investors_total": 168272203.72,
      "recovery_pct": 106.15,
      "tir_pct": 15.62
    },
    "monte_carlo": {
      "tir_pct": {
        "p10": -65.26,
        "median": 11.12,
        "p90": 41.85
      },
      "recovery_pct": {
        "p10": 64.76,
        "median": 104.43,
        "p90": 115.45
      },
      "prob_capital_loss_pct": 41.22,
      "prob_value_preserved_pct": 53.93
    },
    "currencies": [
      {
        "currency": "USD",
        "entry_rate": 3218.75,
        "equilibrium_rate": 3416.63,
        "exits": [
          {
            "exit_rate": 3000,
            "tir_base_pct": 37.22,
            "tir_pct": {
              "p10": -58.77,
              "median": 31.88,
              "p90": 68.35
            }
          },
          {
            "exit_rate": 3359,
            "tir_base_pct": 4.23,
            "tir_pct": {
              "p10": -68.68,
              "median": 0.17,
              "p90": 27.87
            }
          },
          {
            "exit_rate": 3600,
            "tir_base_pct": -11.95,
            "tir_pct": {
              "p10": -73.54,
              "median": -15.37,
              "p90": 8.03
            }
          }
        ]
      }
    ],
    "offer": {
      "publishable": false,
      "reasons": [
        {
          "code": "median_below_offer",
          "message": "La mediana simulada de la TIR en pesos (11,1 %) no alcanza el retorno a ofrecer (12,0 %)."
        },
        {
          "code": "coverage_base",
          "message": "La cobertura del escenario base (1,03) no llega a 1,3."
        },
        {
          "code": "coverage_stress",
          "message": "Con rendimiento y precio estresados la cobertura (0,83) no llega a 1,0."
        }
      ],
      "offered_return_pct": 12,
      "contract_price_per_kg": 1050,
      "minimum_contract_price_per_kg": 1346,
      "median_minimum_contract_price_per_kg": 1054
    }
  },
  "P2": {
    "preset": "P2",
    "motor_version": "surco-motor@1.0.0",
    "seed": 20261017,
    "runs": 20000,
    "crop": "Tomate bajo invernadero",
    "currency": "COP",
    "admission": {
      "passes_filters": true,
      "failed_filters": [],
      "score": 68,
      "level": "B",
      "milestone_range": {
        "min": 3,
        "max": 4
      },
      "labor_line": true
    },
    "capital": {
      "cost": 80000000,
      "producer_contribution": 8000000,
      "milestones_total": 75600000,
      "contingency": 3600000,
      "insurance_premium": 640458,
      "fiduciary_fees": 0,
      "capital": 76240458,
      "investor_capital": 76240458,
      "integrator_capital": 0
    },
    "milestones": [
      {
        "sequence": 1,
        "title": "Montaje y trasplante",
        "day": 0,
        "share_pct": 50,
        "budget": 37800000,
        "supplies": 30330000,
        "labor": 4536000,
        "fee": 1134000,
        "contingency": 1800000
      },
      {
        "sequence": 2,
        "title": "Nutrición y tutorado",
        "day": 30,
        "share_pct": 30,
        "budget": 22680000,
        "supplies": 18198000,
        "labor": 2721600,
        "fee": 680400,
        "contingency": 1080000
      },
      {
        "sequence": 3,
        "title": "Cosecha escalonada",
        "day": 75,
        "share_pct": 20,
        "budget": 15120000,
        "supplies": 12132000,
        "labor": 1814400,
        "fee": 453600,
        "contingency": 720000
      }
    ],
    "coverage": {
      "base": 1.33,
      "stress": 1.073,
      "min_base": 1.3,
      "min_stress": 1,
      "passes": true
    },
    "breakeven": {
      "yield_kg_per_ha": 66889.6,
      "price_per_kg": 1023.02,
      "safety_margin_pct": 21.31
    },
    "base_scenario": {
      "proceeds": 105260000,
      "investors_total": 88197332.14,
      "recovery_pct": 115.68,
      "tir_pct": 55.76
    },
    "monte_carlo": {
      "tir_pct": {
        "p10": 12,
        "median": 53.16,
        "p90": 101.01
      },
      "recovery_pct": {
        "p10": 103.8,
        "median": 115.04,
        "p90": 125.8
      },
      "prob_capital_loss_pct": 8.91,
      "prob_value_preserved_pct": 90.76
    },
    "currencies": [
      {
        "currency": "USD",
        "entry_rate": 3218.75,
        "equilibrium_rate": 3723.55,
        "exits": [
          {
            "exit_rate": 3000,
            "tir_base_pct": 92.94,
            "tir_pct": {
              "p10": 38.74,
              "median": 89.72,
              "p90": 148.99
            }
          },
          {
            "exit_rate": 3359,
            "tir_base_pct": 36.81,
            "tir_pct": {
              "p10": -1.63,
              "median": 34.52,
              "p90": 76.55
            }
          },
          {
            "exit_rate": 3600,
            "tir_base_pct": 10.81,
            "tir_pct": {
              "p10": -20.32,
              "median": 8.96,
              "p90": 43
            }
          }
        ]
      },
      {
        "currency": "EUR",
        "entry_rate": 3750,
        "equilibrium_rate": 4338.12,
        "exits": [
          {
            "exit_rate": 3495,
            "tir_base_pct": 92.96,
            "tir_pct": {
              "p10": 38.75,
              "median": 89.74,
              "p90": 149.02
            }
          },
          {
            "exit_rate": 3913,
            "tir_base_pct": 36.85,
            "tir_pct": {
              "p10": -1.6,
              "median": 34.56,
              "p90": 76.6
            }
          },
          {
            "exit_rate": 4194,
            "tir_base_pct": 10.82,
            "tir_pct": {
              "p10": -20.31,
              "median": 8.97,
              "p90": 43.02
            }
          }
        ]
      }
    ],
    "offer": {
      "publishable": true,
      "reasons": [],
      "offered_return_pct": 12,
      "contract_price_per_kg": 1300,
      "minimum_contract_price_per_kg": 1270,
      "median_minimum_contract_price_per_kg": 1078
    }
  }
};
