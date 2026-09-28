export function stockStatus(product) {
  if (Number(product.quantity) === 0) return 'out';
  return Number(product.quantity) <= Number(product.min_stock) ? 'low' : 'in';
}

export function unitText(quantity, unit, language = 'en') {
  const known = {
    piece: ['piece', 'pieces', 'කැබලි', 'துண்டுகள்'], pack: ['pack', 'packs', 'පැකට්', 'பொதிகள்'],
    box: ['box', 'boxes', 'පෙට්ටි', 'பெட்டிகள்'], dozen: ['dozen', 'dozen', 'දුසිම්', 'டஜன்'],
    kg: ['kg', 'kg', 'කි.ග්‍රෑ.', 'கி.கி.'], metre: ['metre', 'metres', 'මීටර්', 'மீட்டர்'],
  };
  const forms = known[unit];
  const label = forms ? forms[language === 'si' ? 2 : language === 'ta' ? 3 : Number(quantity) === 1 ? 0 : 1] : unit;
  return `${quantity} ${label}`;
}

export const requiredColumns = ['name', 'code', 'barcode', 'purchase_price', 'selling_price', 'quantity', 'min_stock'];
export const importColumns = [...requiredColumns, 'category_id', 'brand_id', 'supplier_id', 'discount', 'tax', 'tax_mode', 'unit', 'description'];

export function normalizeImportRow(raw) {
  const values = {...raw}, issues = [];
  for (const field of requiredColumns) if (values[field] === undefined || values[field] === null || String(values[field]).trim() === '') issues.push({field, message:'Required value'});
  for (const field of ['purchase_price','selling_price','discount','tax']) {
    const source = values[field];
    const n = source === undefined || source === '' || source === null ? 0 : Number(source);
    if (!Number.isFinite(n) || n < 0 || n > (['tax','discount'].includes(field) ? 100 : 1000000) || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001) issues.push({field, message:'Use a nonnegative amount with at most two decimals'});
    values[field] = Math.round(n * 100);
  }
  for (const field of ['quantity','min_stock']) {
    values[field] = Number(values[field]);
    if (!Number.isInteger(values[field]) || values[field] < 0 || values[field] > 100000) issues.push({field, message:'Use a whole number from 0 to 100000'});
  }
  for (const field of ['category_id','brand_id','supplier_id']) values[field] = values[field] === '' || values[field] == null ? null : Number(values[field]);
  for (const field of ['name','code','barcode']) values[field] = String(values[field] ?? '').trim();
  values.tax_mode = String(values.tax_mode|| (values.tax?'custom':'shop'));
  values.unit = String(values.unit || 'piece').trim();
  values.description = String(values.description || '');
  return {values, issues};
}
