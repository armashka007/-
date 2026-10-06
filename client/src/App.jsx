import React, { useEffect, useMemo, useState } from 'react';

const API_URL = 'http://localhost:4000/api';
const paymentMethods = [
  { id: 'bank-card', label: 'Карта', description: 'Visa / Mastercard' },
  { id: 'sberbank', label: 'Сбербанк', description: 'Онлайн перевод' },
  { id: 'tinkoff', label: 'Тинькофф', description: 'Платёж по чеку' },
  { id: 'crypto', label: 'Крипто', description: 'USDT / BTC' },
];

const defaultForm = {
  username: '',
  email: '',
  password: '',
};

function formatCurrency(value = 0) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value);
}

function App() {
  const [casesList, setCasesList] = useState([]);
  const [skinsList, setSkinsList] = useState([]);
  const [blogList, setBlogList] = useState([]);
  const [user, setUser] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState(defaultForm);
  const [checkoutItem, setCheckoutItem] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState('bank-card');
  const [adminMessage, setAdminMessage] = useState('');
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  const token = useMemo(() => localStorage.getItem('skinvault_token'), []);

  const loadCatalog = async () => {
    const [casesRes, skinsRes, blogRes] = await Promise.all([
      fetch(`${API_URL}/cases`),
      fetch(`${API_URL}/skins`),
      fetch(`${API_URL}/blog`),
    ]);

    const casesData = await casesRes.json();
    const skinsData = await skinsRes.json();
    const blogData = await blogRes.json();

    setCasesList(casesData);
    setSkinsList(skinsData);
    setBlogList(blogData);
  };

  const loadUser = async () => {
    const savedToken = localStorage.getItem('skinvault_token');
    if (!savedToken) {
      setUser(null);
      setInventory([]);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${savedToken}`,
        },
      });

      if (!response.ok) {
        localStorage.removeItem('skinvault_token');
        setUser(null);
        setInventory([]);
        return;
      }

      const data = await response.json();
      setUser(data.user);
      setInventory(data.inventory || []);
    } catch {
      localStorage.removeItem('skinvault_token');
      setUser(null);
      setInventory([]);
    }
  };

  useEffect(() => {
    loadCatalog();
    loadUser();
  }, []);

  useEffect(() => {
    if (token) {
      loadUser();
    }
  }, [token]);

  const handleAuthChange = (e) => {
    const { name, value } = e.target;
    setAuthForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: authForm.username,
        email: authForm.email,
        password: authForm.password,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      alert(data.message || 'Ошибка регистрации');
      return;
    }

    localStorage.setItem('skinvault_token', data.token);
    setUser(data.user);
    setIsAuthOpen(false);
    setAuthForm(defaultForm);
    loadUser();
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: authForm.email,
        password: authForm.password,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      alert(data.message || 'Ошибка входа');
      return;
    }

    localStorage.setItem('skinvault_token', data.token);
    setUser(data.user);
    setIsAuthOpen(false);
    setAuthForm(defaultForm);
    loadUser();
  };

  const handleLogout = () => {
    localStorage.removeItem('skinvault_token');
    setUser(null);
    setInventory([]);
  };

  const openCheckout = (item, type) => {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }

    setCheckoutItem({ item, type });
    setSelectedMethod('bank-card');
  };

  const confirmPayment = async () => {
    if (!checkoutItem) return;

    const response = await fetch(`${API_URL}/payments/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('skinvault_token')}`,
      },
      body: JSON.stringify({
        type: checkoutItem.type,
        itemId: checkoutItem.item.id,
        paymentMethod: selectedMethod,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      alert(data.message || 'Ошибка оплаты');
      return;
    }

    alert(`${data.message}. Чек: ${data.check.number} · ${data.check.method}`);
    setCheckoutItem(null);
    setUser(data.user);
    await loadUser();
    await loadCatalog();
  };

  const adminCreateCase = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: form.get('name'),
      price: Number(form.get('price')),
      description: form.get('description'),
      image: form.get('image') || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80',
    };

    const response = await fetch(`${API_URL}/admin/cases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('skinvault_token')}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    setAdminMessage(response.ok ? 'Кейс успешно добавлен' : result.message || 'Ошибка');
    await loadCatalog();
    event.target.reset();
  };

  const adminCreateSkin = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: form.get('name'),
      rarity: form.get('rarity'),
      price: Number(form.get('price')),
      description: form.get('description'),
      image: form.get('image') || 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80',
    };

    const response = await fetch(`${API_URL}/admin/skins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('skinvault_token')}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    setAdminMessage(response.ok ? 'Скин успешно добавлен' : result.message || 'Ошибка');
    await loadCatalog();
    event.target.reset();
  };

  const adminCreateBlog = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      title: form.get('title'),
      content: form.get('content'),
      attachments: [],
    };

    const response = await fetch(`${API_URL}/admin/blog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('skinvault_token')}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    setAdminMessage(response.ok ? 'Публикация добавлена' : result.message || 'Ошибка');
    await loadCatalog();
    event.target.reset();
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="container nav-wrap">
          <div className="brand">
            <span className="brand-mark">S</span>
            <span>SkinVault</span>
          </div>

          <nav className="nav">
            <a href="#cases">Кейсы</a>
            <a href="#marketplace">Магазин</a>
            <a href="#blog">Блог</a>
            <a href="#cabinet">Личный кабинет</a>
          </nav>

          <div className="nav-actions">
            {!user ? (
              <>
                <button className="ghost-btn" onClick={() => setIsAuthOpen(true)}>Войти</button>
                <button className="primary-btn" onClick={() => setIsAuthOpen(true)}>Профиль</button>
              </>
            ) : (
              <>
                <span className="user-badge">{user.username}</span>
                <button className="primary-btn" onClick={() => document.getElementById('cabinet')?.scrollIntoView({ behavior: 'smooth' })}>Кабинет</button>
                <button className="ghost-btn" onClick={handleLogout}>Выйти</button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <span className="eyebrow">Игровые скины нового поколения</span>
              <h1>Открывай редкие кейсы и собирай коллекцию мечты.</h1>
              <p>
                Торговая площадка для редких предметов, кейсов, лут-боксов и контролируемой торговли с безопасной авторизацией.
              </p>
              <div className="hero-actions">
                <a href="#cases" className="primary-btn">Смотреть кейсы</a>
                <button className="secondary-btn" onClick={() => setIsAuthOpen(true)}>Регистрация</button>
              </div>
              <ul className="hero-stats">
                <li><strong>15K+</strong><span>скинов</span></li>
                <li><strong>4.8/5</strong><span>рейтинг</span></li>
                <li><strong>24/7</strong><span>поддержка</span></li>
              </ul>
            </div>

            <div className="hero-visual">
              <div className="skin-card featured-card">
                <div className="skin-image glow-blue" />
                <div className="skin-meta">
                  <span>AWP | Hyper Beast</span>
                  <strong>{formatCurrency(4900)}</strong>
                </div>
              </div>
              <div className="floating-card floating-left">
                <span>Бонус</span>
                <strong>+12% скидка</strong>
              </div>
              <div className="floating-card floating-right">
                <span>Выигрыш</span>
                <strong>Дроп недели</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="highlights">
          <div className="container mini-grid">
            <article>
              <span className="icon">⚡</span>
              <h3>Мгновенная выдача</h3>
              <p>Предметы появляются в профиле после оплаты или открытия кейса.</p>
            </article>
            <article>
              <span className="icon">🛡️</span>
              <h3>Безопасная торговля</h3>
              <p>Реальная авторизация, контроль кошелька и защита аккаунта.</p>
            </article>
            <article>
              <span className="icon">🎯</span>
              <h3>Только редкие дропы</h3>
              <p>Подборка лутов и уникальных предметов для коллекционеров.</p>
            </article>
          </div>
        </section>

        <section className="section" id="cases">
          <div className="container section-header">
            <div>
              <span className="eyebrow">Кейсы</span>
              <h2>Популярные наборы</h2>
            </div>
          </div>
          <div className="container cases-grid">
            {casesList.map((item) => (
              <article key={item.id} className="item-card">
                <div className="item-cover"><img src={item.image} alt={item.name} /></div>
                <div className="item-head">
                  <h3>{item.name}</h3>
                  <span className="rarity">Case</span>
                </div>
                <p>{item.description}</p>
                <div className="meta-row">
                  <span className="price">{formatCurrency(item.price)}</span>
                  <button className="buy-btn" onClick={() => openCheckout(item, 'case')}>Открыть</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="section accent" id="marketplace">
          <div className="container section-header">
            <div>
              <span className="eyebrow">Магазин</span>
              <h2>Топовые скины</h2>
            </div>
          </div>
          <div className="container skins-grid">
            {skinsList.map((skin) => (
              <article key={skin.id} className="item-card">
                <div className="item-cover"><img src={skin.image} alt={skin.name} /></div>
                <div className="item-head">
                  <h3>{skin.name}</h3>
                  <span className="rarity">{skin.rarity}</span>
                </div>
                <p>{skin.description}</p>
                <div className="meta-row">
                  <span className="price">{formatCurrency(skin.price)}</span>
                  <button className="buy-btn" onClick={() => openCheckout(skin, 'skin')}>Купить</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="section" id="blog">
          <div className="container section-header">
            <div>
              <span className="eyebrow">Блог</span>
              <h2>Новости и обзоры</h2>
            </div>
            {user?.role === 'admin' && <span className="badge muted">Админ может редактировать</span>}
          </div>
          <div className="container blog-grid">
            {blogList.map((post) => (
              <article key={post.id} className="blog-card">
                <div>
                  <span className="eyebrow">Новость</span>
                  <h3>{post.title}</h3>
                </div>
                <p className="body">{post.content}</p>
                {post.attachments && post.attachments.length > 0 && (
                  <div className="blog-media">
                    {post.attachments.map((file, idx) => {
                      if (file.type.startsWith('image/')) {
                        return <img key={`${post.id}-${idx}`} src={file.data} alt={file.name} />;
                      }
                      if (file.type.startsWith('video/')) {
                        return <video key={`${post.id}-${idx}`} controls src={file.data} />;
                      }
                      return <span key={`${post.id}-${idx}`} className="badge muted">{file.name}</span>;
                    })}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="section cabinet" id="cabinet">
          <div className="container section-header narrow">
            <div>
              <span className="eyebrow">Личный кабинет</span>
              <h2>Ваш профиль</h2>
            </div>
          </div>

          <div className="container cabinet-layout">
            <aside className="profile-panel">
              <div className="profile-card-box">
                <div className="avatar">{user ? user.username[0].toUpperCase() : 'G'}</div>
                <div>
                  <h3>{user ? user.username : 'Гость'}</h3>
                  <p>{user ? user.email : 'Войдите в систему'}</p>
                </div>
              </div>

              <div className="balance-box">
                <span>Баланс</span>
                <strong>{formatCurrency(user?.balance || 0)}</strong>
              </div>

              {user && <button className="primary-btn" onClick={handleLogout}>Выйти</button>}
            </aside>

            <div className="inventory-panel">
              <div className="panel-header">
                <h3>Инвентарь</h3>
              </div>
              <div className="inventory-grid">
                {inventory.length === 0 ? (
                  <div className="empty-state">Здесь появятся ваши скины после покупки.</div>
                ) : (
                  inventory.map((item) => (
                    <div key={item.id} className="inventory-item">
                      <div className="thumb"><img src={item.image} alt={item.name} /></div>
                      <h4>{item.name}</h4>
                      <span>{item.rarity || 'Редкий'}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        {user?.role === 'admin' && (
          <section className="section admin-panel">
            <div className="container section-header">
              <div>
                <span className="eyebrow">Админ-панель</span>
                <h2>Управление каталогом</h2>
              </div>
            </div>

            <div className="container admin-grid">
              <form className="admin-form" onSubmit={adminCreateCase}>
                <h3>Добавить кейс</h3>
                <input type="text" name="name" placeholder="Название кейса" required />
                <input type="number" name="price" placeholder="Цена" min="0" required />
                <textarea name="description" placeholder="Описание кейса" required />
                <input type="text" name="image" placeholder="Ссылка на изображение" />
                <button type="submit" className="primary-btn">Добавить кейс</button>
              </form>

              <form className="admin-form" onSubmit={adminCreateSkin}>
                <h3>Добавить скин</h3>
                <input type="text" name="name" placeholder="Название скина" required />
                <input type="text" name="rarity" placeholder="Редкость" required />
                <input type="number" name="price" placeholder="Цена" min="0" required />
                <textarea name="description" placeholder="Описание скина" required />
                <input type="text" name="image" placeholder="Ссылка на изображение" />
                <button type="submit" className="primary-btn">Добавить скин</button>
              </form>

              <form className="admin-form wide" onSubmit={adminCreateBlog}>
                <h3>Добавить публикацию</h3>
                <input type="text" name="title" placeholder="Заголовок" required />
                <textarea name="content" placeholder="Текст статьи" required />
                <button type="submit" className="primary-btn">Опубликовать</button>
              </form>
            </div>
            {adminMessage && <p className="admin-message">{adminMessage}</p>}
          </section>
        )}
      </main>

      {isAuthOpen && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setIsAuthOpen(false)}>
          <div className="modal-card">
            <button className="close-btn" onClick={() => setIsAuthOpen(false)}>×</button>

            <div className="auth-tabs">
              <button className={authMode === 'login' ? 'tab-btn active' : 'tab-btn'} onClick={() => setAuthMode('login')}>Вход</button>
              <button className={authMode === 'register' ? 'tab-btn active' : 'tab-btn'} onClick={() => setAuthMode('register')}>Регистрация</button>
            </div>

            {authMode === 'login' ? (
              <form className="auth-form active" onSubmit={handleLogin}>
                <h3>Вход в аккаунт</h3>
                <input type="email" name="email" placeholder="Email" required value={authForm.email} onChange={handleAuthChange} />
                <input type="password" name="password" placeholder="Пароль" required value={authForm.password} onChange={handleAuthChange} />
                <button type="submit" className="primary-btn">Войти</button>
              </form>
            ) : (
              <form className="auth-form active" onSubmit={handleRegister}>
                <h3>Создать аккаунт</h3>
                <input type="text" name="username" placeholder="Имя пользователя" required value={authForm.username} onChange={handleAuthChange} />
                <input type="email" name="email" placeholder="Email" required value={authForm.email} onChange={handleAuthChange} />
                <input type="password" name="password" placeholder="Пароль" required value={authForm.password} onChange={handleAuthChange} />
                <button type="submit" className="primary-btn">Зарегистрироваться</button>
              </form>
            )}
          </div>
        </div>
      )}

      {checkoutItem && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setCheckoutItem(null)}>
          <div className="modal-card payment-card">
            <button className="close-btn" onClick={() => setCheckoutItem(null)}>×</button>
            <h3>Оплата с фиксированным чеком</h3>
            <p className="checkout-title">{checkoutItem.item.name}</p>
            <div className="checkout-amount">{formatCurrency(checkoutItem.item.price)}</div>

            <div className="payment-methods">
              {paymentMethods.map((method) => (
                <button
                  key={method.id}
                  type="button"
                  className={selectedMethod === method.id ? 'method-btn active' : 'method-btn'}
                  onClick={() => setSelectedMethod(method.id)}
                >
                  <span>{method.label}</span>
                  <small>{method.description}</small>
                </button>
              ))}
            </div>

            <div className="receipt-box">
              <span>Фиксированный чек</span>
              <strong>SV-{Date.now().toString().slice(-8)}</strong>
            </div>

            <button className="primary-btn full-width" onClick={confirmPayment}>Подтвердить оплату</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
