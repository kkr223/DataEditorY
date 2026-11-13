import type {
  CardSearchExpression,
  CardRuleOperand,
} from '#lib/modules/card/types.ts';

export type CompiledSearch = {
  clause: string;
  params: Record<string, unknown>;
};

const MAX_ID_VALUE = 4_294_967_295;
const MAX_ID_DIGITS = 10;
const IN_CHUNK_SIZE = 400;

const NUMERIC_COLUMNS: Record<string, string> = {
  id: 'datas.id',
  alias: 'datas.alias',
  atk: 'datas.atk',
  def: 'datas.def',
  level: '(datas.level & 255)',
  ot: 'datas.ot',
  lscale: '((datas.level >> 24) & 255)',
  rscale: '((datas.level >> 16) & 255)',
  attribute: 'datas.attribute',
  race: 'datas.race',
  type: 'datas.type',
  linkMarker: '(CASE WHEN (datas.type & 67108864) = 67108864 THEN datas.def END)',
};

const MASK_COLUMNS: Record<string, string> = {
  attribute: 'datas.attribute',
  race: 'datas.race',
  type: 'datas.type',
  linkMarker: '(CASE WHEN (datas.type & 67108864) = 67108864 THEN datas.def END)',
};

const COMPARE_OPERATORS: Record<string, string> = {
  eq: '=',
  ne: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

function escapeLike(value: string) {
  return value.replaceAll('/', '//').replaceAll('%', '/%').replaceAll('_', '/_');
}

class SearchCompiler {
  params: Record<string, unknown> = {};
  private nextParam = 0;

  private bind(value: unknown) {
    const key = `q${this.nextParam++}`;
    this.params[key] = value;
    return `:${key}`;
  }

  compile(expression: CardSearchExpression): string {
    switch (expression.kind) {
      case 'all':
        return '1=1';
      case 'and':
        return this.compileGroup(expression.expressions, 'AND');
      case 'or':
        return this.compileGroup(expression.expressions, 'OR');
      case 'not':
        return `(NOT ${this.compile(expression.expression)})`;
      case 'textContains': {
        const column = expression.field === 'name' ? 'texts.name' : 'texts.desc';
        return `(${column} LIKE ${this.bind(`%${escapeLike(expression.value)}%`)} ESCAPE '/')`;
      }
      case 'orderedTextContains': {
        const column = expression.field === 'name' ? 'texts.name' : 'texts.desc';
        if (expression.values.length === 0) return '1=1';
        const joined = expression.values.map(escapeLike).join('%');
        return `(${column} LIKE ${this.bind(`%${joined}%`)} ESCAPE '/')`;
      }
      case 'idPrefix':
        return this.compileIdPrefix(expression.value);
      case 'compare': {
        const column = NUMERIC_COLUMNS[expression.field];
        return `(${column} ${COMPARE_OPERATORS[expression.operator]} ${this.bind(expression.value)})`;
      }
      case 'maskContains': {
        const column = MASK_COLUMNS[expression.field];
        const parameter = this.bind(expression.value);
        return `((${column} & ${parameter}) = ${parameter})`;
      }
      case 'maskExcludes': {
        const column = MASK_COLUMNS[expression.field];
        return `((${column} & ${this.bind(expression.value)}) = 0)`;
      }
      case 'setcodeContains': {
        const setcode = expression.value & 0xffff;
        if (setcode === 0) return '1=0';
        const parameter = this.bind(setcode);
        return `(((CAST(datas.setcode AS INTEGER) >> 0) & 65535) = ${parameter} OR ((CAST(datas.setcode AS INTEGER) >> 16) & 65535) = ${parameter} OR ((CAST(datas.setcode AS INTEGER) >> 32) & 65535) = ${parameter} OR ((CAST(datas.setcode AS INTEGER) >> 48) & 65535) = ${parameter})`;
      }
      case 'inIds':
        return this.compileIds(expression.values);
      case 'ruleCompare': {
        const left = this.compileOperand(expression.left);
        const right = this.compileOperand(expression.right);
        return `(${left} ${COMPARE_OPERATORS[expression.operator]} ${right})`;
      }
      case 'ruleMaskContains': {
        const column = MASK_COLUMNS[expression.field];
        const operand = this.compileOperand(expression.operand);
        return `((${column} & ${operand}) = ${operand})`;
      }
    }
  }

  private compileOperand(operand: CardRuleOperand) {
    return operand.kind === 'field'
      ? NUMERIC_COLUMNS[operand.field]
      : this.bind(operand.value);
  }

  private compileGroup(expressions: CardSearchExpression[], operator: 'AND' | 'OR') {
    if (expressions.length === 0) return operator === 'AND' ? '1=1' : '1=0';
    return `(${expressions.map((expression) => this.compile(expression)).join(` ${operator} `)})`;
  }

  private compileIdPrefix(value: string) {
    if (
      value === '0'
      || value === ''
      || value.length > MAX_ID_DIGITS
      || !/^\d+$/.test(value)
      || (value.length > 1 && value.startsWith('0'))
    ) {
      return '1=0';
    }
    const prefix = BigInt(value);
    const ranges: string[] = [];
    for (let digits = value.length; digits <= MAX_ID_DIGITS; digits += 1) {
      const multiplier = 10n ** BigInt(digits - value.length);
      const start = prefix * multiplier;
      if (start > BigInt(MAX_ID_VALUE)) break;
      const end = (prefix + 1n) * multiplier - 1n;
      const boundedEnd = end > BigInt(MAX_ID_VALUE) ? BigInt(MAX_ID_VALUE) : end;
      const lower = this.bind(Number(start));
      const upper = this.bind(Number(boundedEnd));
      ranges.push(`(datas.id BETWEEN ${lower} AND ${upper} OR datas.alias BETWEEN ${lower} AND ${upper})`);
    }
    return ranges.length ? `(${ranges.join(' OR ')})` : '1=0';
  }

  private compileIds(values: number[]) {
    const ids = [...new Set(values.filter((value) => value > 0))].sort((left, right) => left - right);
    if (ids.length === 0) return '1=0';
    const chunks: string[] = [];
    for (let index = 0; index < ids.length; index += IN_CHUNK_SIZE) {
      const parameters = ids
        .slice(index, index + IN_CHUNK_SIZE)
        .map((id) => this.bind(id));
      chunks.push(`datas.id IN (${parameters.join(', ')})`);
    }
    return `(${chunks.join(' OR ')})`;
  }
}

export function compileSearch(expression: CardSearchExpression): CompiledSearch {
  const compiler = new SearchCompiler();
  const clause = compiler.compile(expression);
  return { clause, params: compiler.params };
}
