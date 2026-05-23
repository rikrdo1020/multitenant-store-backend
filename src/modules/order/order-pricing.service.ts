import { Injectable } from '@nestjs/common';

export interface ComboPricingRule {
  productType: string;
  quantity: number;
}

export interface ComboPricingDefinition {
  id: string;
  price: unknown;
  isActive: boolean;
  rules: unknown;
}

export interface ComboPricingItem {
  quantity: number;
  unitPrice: number;
  type?: string;
}

export interface PricingCalculation {
  originalSubtotal: number;
  subtotal: number;
  savings: number;
}

type PriceState = Map<string, number[]>;

interface ActiveComboPricingDefinition {
  id: string;
  price: number;
  rules: ComboPricingRule[];
}

@Injectable()
export class OrderPricingService {
  calculate(
    items: ComboPricingItem[],
    combos: ComboPricingDefinition[] = [],
  ): PricingCalculation {
    const originalSubtotal = this.roundMoney(
      items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    );
    const activeCombos = combos.flatMap((combo) => {
      const normalized = this.normalizeCombo(combo);
      return normalized ? [normalized] : [];
    });

    if (!activeCombos.length || !items.length) {
      return { originalSubtotal, subtotal: originalSubtotal, savings: 0 };
    }

    const savings = this.roundMoney(
      this.findBestSavings(this.buildPriceState(items), activeCombos),
    );
    const subtotal = this.roundMoney(Math.max(0, originalSubtotal - savings));

    return { originalSubtotal, subtotal, savings };
  }

  private findBestSavings(
    state: PriceState,
    combos: ActiveComboPricingDefinition[],
    applications = new Map<string, number>(),
    memo = new Map<string, number>(),
  ): number {
    const memoKey = this.buildMemoKey(state, applications);
    const cached = memo.get(memoKey);
    if (cached !== undefined) return cached;

    let bestSavings = 0;
    for (const combo of combos) {
      const applicationCount = applications.get(combo.id) ?? 0;
      if (applicationCount >= 5) continue;

      const applied = this.tryApplyCombo(state, combo);
      if (!applied || applied.savings <= 0) continue;

      const nextApplications = new Map(applications);
      nextApplications.set(combo.id, applicationCount + 1);

      bestSavings = Math.max(
        bestSavings,
        applied.savings +
          this.findBestSavings(
            applied.state,
            combos,
            nextApplications,
            memo,
          ),
      );
    }

    const rounded = this.roundMoney(bestSavings);
    memo.set(memoKey, rounded);
    return rounded;
  }

  private tryApplyCombo(
    state: PriceState,
    combo: ActiveComboPricingDefinition,
  ): { state: PriceState; savings: number } | null {
    const nextState = this.cloneState(state);
    let matchedTotal = 0;

    for (const rule of combo.rules) {
      const prices = nextState.get(rule.productType) ?? [];
      if (prices.length < rule.quantity) return null;

      const matchedPrices = prices.splice(0, rule.quantity);
      matchedTotal += matchedPrices.reduce((sum, price) => sum + price, 0);

      if (prices.length === 0) {
        nextState.delete(rule.productType);
      } else {
        nextState.set(rule.productType, prices);
      }
    }

    return {
      state: nextState,
      savings: this.roundMoney(matchedTotal - combo.price),
    };
  }

  private buildPriceState(items: ComboPricingItem[]): PriceState {
    const state: PriceState = new Map();

    for (const item of items) {
      if (!item.type) continue;

      const prices = state.get(item.type) ?? [];
      for (let count = 0; count < item.quantity; count += 1) {
        prices.push(item.unitPrice);
      }
      prices.sort((a, b) => b - a);
      state.set(item.type, prices);
    }

    return state;
  }

  private cloneState(state: PriceState): PriceState {
    return new Map(
      [...state.entries()].map(([type, prices]) => [type, [...prices]]),
    );
  }

  private normalizeCombo(
    combo: ComboPricingDefinition,
  ): ActiveComboPricingDefinition | null {
    if (!combo.isActive) return null;

    const rules = this.getComboRules(combo.rules);
    if (!rules.length) return null;

    return {
      id: combo.id,
      price: this.toMoney(combo.price),
      rules,
    };
  }

  private getComboRules(rules: unknown): ComboPricingRule[] {
    if (!Array.isArray(rules)) return [];

    return rules.flatMap((rule) => {
      if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return [];

      const candidate = rule as Record<string, unknown>;
      const productType = candidate.productType;
      const quantity = Number(candidate.quantity);

      if (
        typeof productType !== 'string' ||
        !productType.trim() ||
        !Number.isInteger(quantity) ||
        quantity < 1
      ) {
        return [];
      }

      return [{ productType, quantity }];
    });
  }

  private toMoney(value: unknown): number {
    if (value === null || value === undefined) return 0;

    const amount = Number(value);
    return Number.isFinite(amount) ? this.roundMoney(amount) : 0;
  }

  private buildMemoKey(
    state: PriceState,
    applications: Map<string, number>,
  ): string {
    return JSON.stringify({
      applications: [...applications.entries()].sort(([a], [b]) =>
        a.localeCompare(b),
      ),
      state: [...state.entries()].sort(([a], [b]) => a.localeCompare(b)),
    });
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
