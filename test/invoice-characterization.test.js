'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const invoice = require('../lib/invoice');
const pricing = require('../lib/pricing');
const reports = require('../lib/reports');

function inMemoryOrder(item, coupon) {
  return {
    id: 1,
    coupon: coupon || '',
    items: [Object.assign({
      id: 1,
      sku: 'TEST-001',
      name: 'Test rice',
      hsn: '1006',
      price: 1000,
      qty: 1
    }, item || {})]
  };
}

test('invoice matches the billed HSN tax, coupon discount, GST split, and total', function () {
  const order = inMemoryOrder({ price: 640 }, 'SAVE10');
  const billed = pricing.computeTotals(order.items, order.coupon);
  const printed = invoice.computeInvoiceFigures(order);

  assert.deepEqual({
    subtotal: printed.subtotal,
    discount: printed.discount,
    tax: printed.tax,
    cgst: printed.cgst,
    sgst: printed.sgst,
    total: printed.total,
    gstPercent: printed.rows[0].gstPercent,
    lineTax: printed.rows[0].lineTax
  }, {
    subtotal: billed.subtotal,
    discount: billed.discount,
    tax: billed.tax,
    cgst: billed.cgst,
    sgst: billed.sgst,
    total: billed.total,
    gstPercent: billed.lines[0].gstPercent,
    lineTax: billed.lines[0].tax
  });
});

test('rendered invoice shows the billed totals without a reconciliation warning', function () {
  const order = Object.assign(inMemoryOrder({ price: 640 }, 'SAVE10'), {
    date: '01/01/2022',
    customer: 'Test customer',
    subtotal: 640,
    discount: 64,
    tax: 28.8,
    total: 604.8
  });
  const html = invoice.render(order);

  assert.match(html, /CGST \+ SGST \(Total GST\)<\/td><td class="r">₹28\.80/);
  assert.match(html, /Invoice Total<\/td><td class="r">₹604\.80/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});

test('invoice uses the HSN slab and matches the billed GST breakdown and total', function () {
  const order = inMemoryOrder();
  const billed = pricing.computeTotals(order.items, '');
  const printed = invoice.computeInvoiceFigures(order);

  assert.equal(billed.lines[0].gstPercent, 5);
  assert.equal(billed.tax, 50);
  assert.equal(billed.cgst, 25);
  assert.equal(billed.sgst, 25);
  assert.equal(billed.total, 1050);

  assert.equal(printed.rows[0].gstPercent, 5);
  assert.equal(printed.tax, billed.tax);
  assert.equal(printed.cgst, billed.cgst);
  assert.equal(printed.sgst, billed.sgst);
  assert.equal(printed.total, billed.total);
});

test('GST reconciliation matches the invoice calculation to the billed order', function () {
  const order = Object.assign(inMemoryOrder(), {
    date: '01/01/2022',
    customer: 'Test customer',
    subtotal: 1000,
    discount: 0,
    tax: 50,
    total: 1050
  });
  const reconciliation = reports.getGstReconciliation({ orders: [order] });

  assert.equal(reconciliation.totalChecked, 1);
  assert.equal(reconciliation.mismatchCount, 0);
  assert.equal(reconciliation.totalDelta, 0);
  assert.equal(reconciliation.rows[0].ledgerTax, 50);
  assert.equal(reconciliation.rows[0].invoiceTax, 50);
  assert.equal(reconciliation.rows[0].invoiceTotal, 1050);
  assert.equal(reconciliation.rows[0].delta, 0);
  assert.equal(reconciliation.rows[0].matched, true);
});

test('invoice applies the billed subtotal discount and coupon cap before tax', function () {
  const order = inMemoryOrder({ price: 2000 }, 'SAVE10');
  const billed = pricing.computeTotals(order.items, 'SAVE10');
  const printed = invoice.computeInvoiceFigures(order);

  assert.equal(billed.subtotal, 2000);
  assert.equal(billed.discount, 150);
  assert.equal(billed.tax, 92.5);
  assert.equal(billed.total, 1942.5);

  assert.equal(printed.subtotal, 2000);
  assert.equal(printed.tax, billed.tax);
  assert.equal(printed.discount, billed.discount);
  assert.equal(printed.cgst, billed.cgst);
  assert.equal(printed.sgst, billed.sgst);
  assert.equal(printed.total, billed.total);
});

test('invoice uses gstRate on the line when it is present', function () {
  const order = inMemoryOrder({ gstRate: 12 });
  const printed = invoice.computeInvoiceFigures(order);

  assert.equal(printed.rows[0].gstPercent, 12);
  assert.equal(printed.tax, 120);
  assert.equal(printed.cgst, 60);
  assert.equal(printed.sgst, 60);
  assert.equal(printed.total, 1120);
});
