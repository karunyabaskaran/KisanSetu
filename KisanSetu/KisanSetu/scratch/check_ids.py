with open('frontend/index.html', encoding='utf-8') as f:
    html = f.read()

ids = [
    'reg_address',
    'prod_image_file', 'prod_image_preview_box', 'prod_image_preview', 'btnClearProdImage',
    'btnOpenCart', 'buyerCartCountBadge', 'cartLocationBanner', 'cartLocationBannerText',
    'buyerCartModal', 'cartRuleCount', 'cartRuleWeight', 'buyerCartItemsList', 'cart_delivery_address', 'btnProceedToPayment',
    'paymentGatewayModal', 'paymentModalPayableAmount', 'paymentModalItemsCount', 'payTab_upi', 'payTab_card', 'payTab_cod',
    'orderInvoiceModal', 'printableInvoiceContent',
    'buyerGroupedPickupsContainer'
]

missing = [i for i in ids if f'id="{i}"' not in html and f"id='{i}'" not in html]
if missing:
    print('Missing IDs:', missing)
else:
    print('SUCCESS: All 24 UI element IDs verified in frontend/index.html!')
