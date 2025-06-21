// Fetch menu data - don't modify endpoint
const fetchMenu = async () => {
  const res = await fetch('menu.json'); // TODO: replace with real endpoint
  return res.json();
};

let menu = [];
let cart = JSON.parse(sessionStorage.getItem('cart') || '[]');
let currentPizza = null;

const cartTotalEl = document.getElementById('cart-total');
const cartBadgeEl = document.getElementById('cart-badge');

fetchMenu().then(data => {
  menu = data;
  renderMenu();
  updateCartUI();
});

// Render menu items
const renderMenu = () => {
  const cont = document.getElementById('menu');
  cont.innerHTML = '';
  menu.forEach(item => {
    const card = document.createElement('div');
    card.className = 'p-4 shadow rounded-lg flex flex-col items-center';
    card.innerHTML = `
      <img src="${item.imagen}" alt="${item.nombre}" loading="lazy" width="150" height="150" class="mb-2 rounded">
      <h3 class="font-semibold text-center">${item.nombre} ${renderFlags(item)}</h3>
      <p class="text-sm text-gray-500 mb-2">${item.ingredientes || ''}</p>
      <span class="font-bold mb-2">${item.precio.toFixed(2)}€</span>
      <button class="btn-primary focus-ring" data-id="${item.id}">Añadir</button>`;
    card.querySelector('button').addEventListener('click', () => openModal(item.id));
    cont.appendChild(card);
  });
};

// Render flags icons
const renderFlags = item => {
  const flags = [];
  if (item.picante) flags.push('<svg class="inline w-4 h-4 text-red-600 ml-1">'+document.getElementById('icon-spicy').innerHTML+'</svg>');
  if (item.veggie) flags.push('<svg class="inline w-4 h-4 text-green-600 ml-1">'+document.getElementById('icon-veggie').innerHTML+'</svg>');
  if (item.singluten) flags.push('<svg class="inline w-4 h-4 text-yellow-600 ml-1">'+document.getElementById('icon-gluten').innerHTML+'</svg>');
  if (item.top) flags.push('<svg class="inline w-4 h-4 text-blue-600 ml-1">'+document.getElementById('icon-star').innerHTML+'</svg>');
  return flags.join('');
};

// Modal handling
const modal = document.getElementById('pizza-modal');
const modalContent = document.getElementById('pizza-modal-content');

const openModal = id => {
  currentPizza = menu.find(p => p.id === id);
  if(!currentPizza) return;
  modal.classList.remove('hidden');
  buildModal(currentPizza);
};

const closeModal = () => {
  modal.classList.add('hidden');
};

document.getElementById('modal-close').addEventListener('click', closeModal);

const buildModal = pizza => {
  modalContent.innerHTML = `
    <h3 class="text-xl font-semibold mb-4">${pizza.nombre}</h3>
    <div class="mb-2">
      <label class="block mb-1">Tamaño</label>
      <select id="pizza-size" class="focus-ring border rounded w-full p-2">
        <option value="1">Normal</option>
        <option value="1.5">Familiar (+50%)</option>
      </select>
    </div>
    <div class="mb-2">
      <label class="block mb-1">Masa</label>
      <select id="pizza-masa" class="focus-ring border rounded w-full p-2">
        <option value="0">Tradicional</option>
        <option value="1">Integral</option>
        <option value="1">Sin gluten</option>
      </select>
    </div>
    <div class="mb-2">
      <p class="mb-1">Toppings</p>
      <div id="pizza-toppings" class="flex flex-wrap gap-2"></div>
    </div>
    <div class="mb-2">
      <label class="block mb-1" for="pizza-note">Nota</label>
      <textarea id="pizza-note" class="focus-ring border rounded w-full p-2" rows="2"></textarea>
    </div>
    <div class="font-bold mb-4">Precio: <span id="pizza-price">${pizza.precio.toFixed(2)}</span>€</div>
    <button id="add-pizza" class="btn-primary w-full">Añadir al carrito</button>
  `;

  const toppingsEl = document.getElementById('pizza-toppings');
  (pizza.toppings || []).forEach(top => {
    const id = 'top-'+top.nombre.replace(/\s+/g,'');
    const label = document.createElement('label');
    label.className = 'mr-4 flex items-center';
    label.innerHTML = `<input type="checkbox" id="${id}" value="${top.precio}" class="mr-1">${top.nombre} (+${top.precio}€)`;
    toppingsEl.appendChild(label);
  });

  document.getElementById('pizza-size').addEventListener('change', updateModalPrice);
  toppingsEl.querySelectorAll('input').forEach(el => el.addEventListener('change', updateModalPrice));
  document.getElementById('add-pizza').addEventListener('click', addPizzaToCart);
};

const updateModalPrice = () => {
  if(!currentPizza) return;
  const sizeFactor = parseFloat(document.getElementById('pizza-size').value);
  let price = currentPizza.precio * sizeFactor;
  document.querySelectorAll('#pizza-toppings input:checked').forEach(ch => price += parseFloat(ch.value));
  document.getElementById('pizza-price').textContent = price.toFixed(2);
};

const addPizzaToCart = () => {
  const sizeFactor = parseFloat(document.getElementById('pizza-size').value);
  let price = currentPizza.precio * sizeFactor;
  const toppings = [];
  document.querySelectorAll('#pizza-toppings input:checked').forEach(ch => {
    price += parseFloat(ch.value);
    toppings.push(ch.parentNode.textContent.trim());
  });
  const note = document.getElementById('pizza-note').value;
  cart.push({
    ...currentPizza,
    price,
    size: sizeFactor,
    toppings,
    note,
    type:'pizza'
  });
  sessionStorage.setItem('cart', JSON.stringify(cart));
  updateCartUI();
  closeModal();
  sendAnalytics('add_to_cart', {item_name: currentPizza.nombre, price});
};

// Cart functions
const updateCartUI = () => {
  const sum = cart.reduce((a,b)=>a+b.price,0);
  cartTotalEl.textContent = sum.toFixed(2)+'€';
  cartBadgeEl.textContent = cart.length;
  cartBadgeEl.classList.toggle('hidden', cart.length===0);
  renderCartList();
  checkCrossSell();
};

const renderCartList = () => {
  const list = document.getElementById('cart-items');
  list.innerHTML = '';
  cart.forEach((item,i)=>{
    const li = document.createElement('li');
    li.className = 'flex justify-between items-start mb-2';
    li.innerHTML = `<div><p>${item.nombre}</p><p class="text-sm text-gray-500">${item.toppings?item.toppings.join(', '):''}</p></div><div><span class="mr-2">${item.price.toFixed(2)}€</span><button class="text-blue-600" data-i="${i}">Editar</button></div>`;
    li.querySelector('button').addEventListener('click', ()=>editItem(i));
    list.appendChild(li);
  });
};

const editItem = index => {
  const item = cart[index];
  if(item.type==='pizza'){
    currentPizza = item;
    buildModal(item);
    modal.classList.remove('hidden');
    cart.splice(index,1);
  }
};

// Sticky bar actions
document.getElementById('checkout-btn').addEventListener('click', () => {
  goToStep(2);
  sendAnalytics('begin_checkout', {value: cart.reduce((a,b)=>a+b.price,0)});
});

// Wizard navigation
let step = 1;
const goToStep = num => {
  step = num;
  document.querySelectorAll('[data-step]').forEach(el => el.classList.add('hidden'));
  document.getElementById('step-'+step).classList.remove('hidden');
  document.querySelectorAll('#progress li').forEach((li,i)=>{
    li.classList.toggle('font-bold', i+1===step);
  });
};

document.querySelectorAll('.next-step').forEach(btn=>btn.addEventListener('click',()=>goToStep(step+1)));
document.querySelectorAll('.prev-step').forEach(btn=>btn.addEventListener('click',()=>goToStep(step-1)));

// Cross sell
const checkCrossSell = () => {
  const hasPizza = cart.some(i=>i.categoria==='pizzas');
  const hasBebida = cart.some(i=>i.categoria==='bebidas');
  const banner = document.getElementById('cross-sell');
  banner.classList.toggle('hidden', !(hasPizza && !hasBebida));
};

document.getElementById('add-combo').addEventListener('click',()=>{
  cart.push({nombre:'Combo bebida + helado', price:3, categoria:'combo'});
  sessionStorage.setItem('cart', JSON.stringify(cart));
  updateCartUI();
});

// Payment step
const payBtn = document.getElementById('pay-btn');
payBtn.addEventListener('click', async ()=>{
  const ok = await verifyCaptcha();
  if(!ok) return;
  sendAnalytics('purchase', {value: cart.reduce((a,b)=>a+b.price,0)});
  alert('Pago procesado (simulado)');
  sessionStorage.clear();
});

// Analytics
function sendAnalytics(ev, params){
  window.gtag && gtag('event', ev, params);
  window.fbq && fbq('track', ev, params);
}

// reCAPTCHA stub
function verifyCaptcha(){
  // TODO: integrate real recaptcha
  return Promise.resolve(true);
}
