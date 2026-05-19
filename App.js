import React, { useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Image, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View, FlatList, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBbSGFnHbjiJpUlSRy5zTHiRSJRN21z0Jo",
  authDomain: "trendwearapp.firebaseapp.com",
  projectId: "trendwearapp",
  storageBucket: "trendwearapp.firebasestorage.app",
  messagingSenderId: "493517904753",
  appId: "1:493517904753:web:25e0fe52af3611c40d74d0",
};
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// In-memory stores
let cart = [];
let currentCustomer = null;

function getCart() { return cart; }
function clearCart() { cart = []; }
function addToCart(product, quantity = 1) {
  if (!product) return;
  const qty = Number(quantity) || 1;
  const existing = cart.find((x) => x.productId === product.id);
  if (existing) existing.quantity += qty;
  else cart.push({ productId: product.id, name: product.name, price: Number(product.price ?? 0), description: product.description ?? '', image: product.image ?? '', quantity: qty });
}

// Firestore services
const PRODUCTS_COLLECTION = 'Products';
const ORDERS_COLLECTION = 'Orders';
const USERS_COLLECTION = 'Users';

async function listProducts() {
  const snap = await getDocs(collection(db, PRODUCTS_COLLECTION));
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), image: (d.data()?.image ?? '').trim() }));
}
async function createProduct({ name, price, description, image }) {
  const docRef = await addDoc(collection(db, PRODUCTS_COLLECTION), { name, price: Number(price), description: description ?? '', image: (image ?? '').trim(), createdAt: Date.now() });
  return docRef.id;
}
async function updateProduct(productId, { name, price, description, image }) {
  const ref = doc(db, PRODUCTS_COLLECTION, productId);
  await updateDoc(ref, { name, price: Number(price), description: description ?? '', image: (image ?? '').trim(), updatedAt: Date.now() });
}
async function deleteProduct(productId) { const ref = doc(db, PRODUCTS_COLLECTION, productId); await deleteDoc(ref); }

async function createOrder({ items, totalPrice, customerName, customerEmail, customerPhone }) {
  const docRef = await addDoc(collection(db, ORDERS_COLLECTION), { items: items ?? [], totalPrice: Number(totalPrice ?? 0), customerName: customerName ?? '', customerEmail: customerEmail ?? '', customerPhone: customerPhone ?? '', status: 'placed', createdAt: Date.now() });
  return docRef.id;
}

async function upsertCustomerProfile({ uid, displayName, email }) {
  if (!uid) throw new Error('Missing uid');
  const ref = doc(db, USERS_COLLECTION, uid);
  await updateDoc(ref, { uid, displayName: displayName ?? '', email: email ?? '', updatedAt: Date.now() }).catch(async () => {
    await addDoc(collection(db, USERS_COLLECTION), { uid, displayName: displayName ?? '', email: email ?? '', createdAt: Date.now() });
  });
  return uid;
}

async function uploadImageToFirebase({ uri, filename, contentType }) {
  const storage = getStorage(app);
  const safeFilename = (filename ?? 'image').toString().replace(/[^a-zA-Z0-9._-]/g, '');
  const folder = `product-images/${Date.now()}`;
  const fullPath = `${folder}/${safeFilename || 'image'}`;

  const blob = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onerror = () => reject(new Error('Failed to read image as blob'));
    xhr.onload = () => resolve(xhr.response);
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });

  const storageRef = ref(storage, fullPath);
  await uploadBytes(storageRef, blob, contentType ? { contentType } : undefined);
  return await getDownloadURL(storageRef);
}

async function signUpWithEmailPassword({ email, password }) { const res = await createUserWithEmailAndPassword(auth, email, password); return res.user; }
async function signInWithEmailPassword({ email, password }) { const res = await signInWithEmailAndPassword(auth, email, password); return res.user; }

// UI components
const COLORS = { bg: '#070a12', primary: '#4f46e5', muted: '#9ca3af', border: 'rgba(255,255,255,0.18)', text: '#e5e7eb' };

function AppScreen({ children, style }) {
  return <SafeAreaView style={[stylesApp.container, style]}>{children}</SafeAreaView>;
}

function PrimaryButton({ title, onPress, disabled }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[stylesApp.btn, disabled ? stylesApp.btnDisabled : null]}>
      <Text style={stylesApp.txt}>{title}</Text>
    </Pressable>
  );
}

function TextInputField({ label, value, onChangeText, placeholder, keyboardType }) {
  return (
    <View style={{ marginTop: 12 }}>
      {label ? <Text style={{ fontSize: 13, color: COLORS.muted, marginBottom: 6, fontWeight: '700' }}>{label}</Text> : null}
      <TextInput style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: COLORS.text }} value={value} onChangeText={onChangeText} placeholder={placeholder} keyboardType={keyboardType} placeholderTextColor={COLORS.muted} />
    </View>
  );
}

// Screens
function SplashScreen({ navigation }) {
  useEffect(() => {
    const t = setTimeout(() => navigation.reset({ index: 0, routes: [{ name: 'Customer' }] }), 900);
    return () => clearTimeout(t);
  }, [navigation]);
  return (
    <AppScreen style={{ backgroundColor: '#0b1220', paddingTop: 0, flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Image source={require('./assets/tshirt.png')} style={{ width: 110, height: 110, borderRadius: 26, marginBottom: 16 }} />
      <Text style={{ color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: 0.4 }}>TrendWear</Text>
      <Text style={{ color: '#9ca3af', marginTop: 6, fontWeight: '700' }}>Clothing shop (Demo)</Text>
    </AppScreen>
  );
}

function CustomerLoginScreen({ navigation }) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const canSubmit = useMemo(() => displayName.trim().length > 0 && email.trim().length > 0 && password.trim().length > 0, [displayName, email, password]);

  async function onLogin() {
    if (!canSubmit || loading) return;
    try {
      setLoading(true);
      const emailValue = email.trim().toLowerCase();
      let user;
      try { user = await signInWithEmailPassword({ email: emailValue, password }); } catch (err) { user = await signUpWithEmailPassword({ email: emailValue, password }); }
      try { await upsertCustomerProfile({ uid: user.uid, displayName: displayName.trim(), email: user.email }); } catch (e) { }
      setCurrentCustomer({ displayName: displayName.trim(), email: user.email, uid: user.uid });
      Alert.alert('Welcome', 'You are logged in.');
      navigation.reset({ index: 0, routes: [{ name: 'Products' }] });
    } catch (e) { console.log(e); Alert.alert('Login failed', 'Could not save login info.'); }
    finally { setLoading(false); }
  }

  return (
    <AppScreen>
      <View style={{ alignItems: 'center', marginTop: 10, marginBottom: 16 }}>
        <Image source={require('./assets/tshirt.png')} style={{ width: 76, height: 76, borderRadius: 18, marginBottom: 8 }} />
        <Text style={{ fontSize: 28, fontWeight: '900', color: '#dce0e9' }}>TrendWear</Text>
        <Text style={{ color: '#a1abc0', marginTop: 6, textAlign: 'center', lineHeight: 18, width: '90%' }}>Login as customer to place orders.</Text>
      </View>
      <TextInputField label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="e.g. Juan Dela Cruz" />
      <TextInputField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
      <TextInputField label="Password" value={password} onChangeText={setPassword} placeholder="Your password" keyboardType="default" />
      <PrimaryButton title={loading ? 'Logging...' : 'Login'} onPress={onLogin} disabled={!canSubmit || loading} />
      <View style={{ marginTop: 14, padding: 12 }}><Text style={{ color: '#3d4759', lineHeight: 18, fontWeight: '600' }}>Login using Firebase Auth (email + password). We also save your profile to Firestore Users.</Text></View>
      <Pressable onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Products' }] })} style={{ marginTop: 12, alignItems: 'center' }}><Text style={{ color: '#2563eb', fontWeight: '900' }}>Skip login</Text></Pressable>
    </AppScreen>
  );
}

function ProductsListScreen({ navigation }) {
  const [loading, setLoadingState] = useState(true);
  const [products, setProductsState] = useState([]);
  useEffect(() => {
    let mounted = true;
    (async () => { try { const res = await listProducts(); if (mounted) setProductsState(res); } catch (e) { console.log(e); } finally { if (mounted) setLoadingState(false); } })();
    return () => { mounted = false; };
  }, []);

  return (
    <AppScreen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Image source={require('./assets/tshirt.png')} style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }} />
          <View><Text style={{ fontSize: 22, fontWeight: '900', color: '#fff' }}>TrendWear</Text><Text style={{ marginTop: 2, color: '#9ca3af', fontWeight: '700' }}>Shop latest styles</Text></View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={() => navigation.navigate('Cart')} style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: '#0b1220', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>Cart</Text></Pressable>
          <Pressable onPress={() => navigation.navigate('Checkout')} style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: '#4f46e5' }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>Checkout</Text></Pressable>
          <Pressable onPress={() => navigation.navigate('Admin')} style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: '#22c55e' }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>Admin</Text></Pressable>
        </View>
      </View>
      {loading ? <Text style={{ color: '#cbd5e1' }}>Loading...</Text> : <FlatList data={products} keyExtractor={(item) => item.id} renderItem={({ item }) => (
        <Pressable onPress={() => navigation.navigate('ProductDetails', { product: item })} style={{ flexDirection: 'row', gap: 12, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 12, backgroundColor: '#0f172a' }}>
          {item.image ? <Image source={{ uri: item.image }} style={{ width: 86, height: 86, borderRadius: 14 }} /> : <View style={{ width: 86, height: 86, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)' }} />}
          <View style={{ flex: 1 }}><Text style={{ fontWeight: '900', fontSize: 16, marginTop: 2, color: '#fff' }} numberOfLines={1}>{item.name}</Text><Text style={{ marginTop: 6, fontWeight: '900', color: '#fff' }}>${Number(item.price ?? 0).toFixed(2)}</Text><Text style={{ marginTop: 6, color: '#9ca3af' }} numberOfLines={2}>{item.description || ''}</Text></View>
        </Pressable>
      )} />}
    </AppScreen>
  );
}

function ProductDetailsScreen({ route, navigation }) {
  const { product } = route.params;
  const [qty, setQty] = useState(1);
  const price = useMemo(() => Number(product?.price ?? 0), [product]);
  return (
    <AppScreen>
      <View style={{ borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', backgroundColor: '#0f172a' }}>
        {product?.image ? <Image source={{ uri: product.image }} style={{ width: '100%', height: 260 }} /> : <View style={{ width: '100%', height: 260, backgroundColor: 'rgba(255,255,255,0.04)' }} />}
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 24, fontWeight: '900', color: '#fff' }}>{product?.name}</Text>
          <Text style={{ marginTop: 10, fontWeight: '900', fontSize: 20, color: '#fff' }}>${price.toFixed(2)}</Text>
          <Text style={{ marginTop: 10, color: '#9ca3af', lineHeight: 20 }}>{product?.description || ''}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 12 }}>
            <Pressable onPress={() => setQty((x) => Math.max(1, x - 1))} style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#0b1220', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>-</Text></Pressable>
            <Text style={{ fontSize: 18, fontWeight: '900', color: '#fff' }}>{qty}</Text>
            <Pressable onPress={() => setQty((x) => x + 1)} style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#0b1220', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>+</Text></Pressable>
          </View>
          <PrimaryButton title="Add to Cart" onPress={() => { addToCart(product, qty); navigation.navigate('Cart'); }} />
        </View>
      </View>
    </AppScreen>
  );
}

function CartScreen({ navigation }) {
  const [, setVersion] = useState(0);
  const bump = () => setVersion((x) => x + 1);
  const cartArr = getCart();
  const total = getCartTotal();
  return (
    <AppScreen>
      <View style={{ marginBottom: 14 }}><Text style={{ fontSize: 26, fontWeight: '900', color: '#fff' }}>Your Cart</Text><Text style={{ marginTop: 4, color: COLORS.muted, fontWeight: '700' }}>Review items and checkout</Text><Pressable onPress={() => { clearCart(); bump(); }} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#ef4444', marginTop: 8 }}><Text style={{ color: '#fff', fontWeight: '900' }}>Clear</Text></Pressable></View>
      {cartArr.length === 0 ? <Text>No items in cart.</Text> : <>
        <FlatList data={cartArr} keyExtractor={(item) => item.productId} renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', gap: 12, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 12, backgroundColor: '#0f172a' }}>
            {item.image ? <Image source={{ uri: item.image }} style={{ width: 70, height: 70, borderRadius: 12 }} /> : <View style={{ width: 70, height: 70, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' }} />}
            <View style={{ flex: 1 }}><Text style={{ fontWeight: '900', fontSize: 15, color: '#fff' }} numberOfLines={1}>{item.name}</Text><Text style={{ marginTop: 6, color: COLORS.muted }}>${Number(item.price ?? 0).toFixed(2)} each</Text>
              <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Pressable onPress={() => { updateCartItemQuantity(item.productId, item.quantity - 1); bump(); }} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#0b1220', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '900' }}>-</Text></Pressable>
                <Text style={{ minWidth: 28, textAlign: 'center', fontWeight: '900', color: '#fff' }}>{item.quantity}</Text>
                <Pressable onPress={() => { updateCartItemQuantity(item.productId, item.quantity + 1); bump(); }} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#0b1220', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '900' }}>+</Text></Pressable>
                <Pressable onPress={() => { removeFromCart(item.productId); bump(); }} style={{ marginLeft: 'auto' }}><Text style={{ color: '#ef4444', fontWeight: '800' }}>Remove</Text></Pressable>
              </View>
            </View>
          </View>
        )} />
        <View style={{ marginTop: 6, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(15,23,42,0.6)' }}><Text style={{ fontWeight: '800', color: COLORS.muted }}>Total</Text><Text style={{ fontWeight: '900', fontSize: 18, color: '#fff' }}>${total.toFixed(2)}</Text></View>
        <PrimaryButton title="Checkout" onPress={() => navigation.navigate('Checkout')} />
      </>}
    </AppScreen>
  );
}

function CheckoutScreen({ navigation }) {
  const cartArr = getCart();
  const total = getCartTotal();
  const current = getCurrentCustomer();
  const [customerName, setCustomerName] = useState(current?.displayName ?? '');
  const [customerEmail, setCustomerEmail] = useState(current?.contact ?? '');
  const [customerPhone, setCustomerPhone] = useState('');
  const [loading, setLoadingState] = useState(false);
  const canSubmit = cartArr.length > 0 && customerName.trim() && customerEmail.trim();

  async function onPlaceOrder() {
    if (!canSubmit || loading) return;
    const items = cartArr.map((x) => ({ productId: x.productId, name: x.name, price: x.price, quantity: x.quantity, image: x.image }));
    try {
      setLoadingState(true);
      await createOrder({ items, totalPrice: total, customerName, customerEmail, customerPhone });
      clearCart();
      Alert.alert('Order placed', 'Thanks! Your order was saved in Firestore.');
      navigation.reset({ index: 0, routes: [{ name: 'Customer' }] });
    } catch (e) { console.log(e); Alert.alert('Checkout failed', 'Please check your Firebase config and try again.'); }
    finally { setLoadingState(false); }
  }

  return (
    <AppScreen>
      <Text style={{ fontSize: 26, fontWeight: '900', marginBottom: 6, color: '#fff' }}>Checkout</Text>
      <Text style={{ fontWeight: '900', color: '#fff', marginBottom: 12, fontSize: 16 }}>Total: ${total.toFixed(2)}</Text>
      <View style={{ marginBottom: 8, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(15,23,42,0.55)' }}><Text style={{ color: '#9ca3af', fontWeight: '700', lineHeight: 18 }}>This will create an order in Firestore.</Text></View>
      {cartArr.length === 0 ? <View style={{ paddingVertical: 20 }}><Text>No items in cart.</Text></View> : <View>
        <TextInputField label="Name" value={customerName} onChangeText={setCustomerName} placeholder="Your full name" />
        <TextInputField label="Email" value={customerEmail} onChangeText={setCustomerEmail} placeholder="you@example.com" keyboardType="email-address" />
        <TextInputField label="Phone (optional)" value={customerPhone} onChangeText={setCustomerPhone} placeholder="Phone number" keyboardType="phone-pad" />
        <PrimaryButton title={loading ? 'Placing...' : 'Place Order'} onPress={onPlaceOrder} disabled={!canSubmit || loading} />
      </View>}
    </AppScreen>
  );
}

const ADMIN_PIN = '1234';
function AdminLoginScreen({ navigation, route }) {
  const [pin, setPin] = useState('');
  const [loading, setLoadingState] = useState(false);
  const expected = route?.params?.pin ?? ADMIN_PIN;
  async function onLogin() { if (loading) return; if (pin.trim() !== expected) { Alert.alert('Login failed', 'Invalid admin PIN.'); return; } setLoadingState(true); try { navigation.reset({ index: 0, routes: [{ name: 'AdminProducts' }] }); } finally { setLoadingState(false); } }
  return (
    <AppScreen>
      <Text style={{ fontSize: 22, fontWeight: '900', marginBottom: 4 }}>Admin Login</Text>
      <Text style={{ color: '#6b7280', marginBottom: 12, lineHeight: 18 }}>Enter admin PIN to manage products.</Text>
      <TextInputField label="Admin PIN" value={pin} onChangeText={setPin} placeholder="1234" keyboardType="numeric" />
      <PrimaryButton title={loading ? 'Logging...' : 'Login'} onPress={onLogin} disabled={pin.length < 1 || loading} />
      <View style={{ marginTop: 18, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fafafa' }}><Text style={{ color: '#374151' }}>Default PIN is <Text style={{ fontWeight: '900' }}>1234</Text></Text></View>
    </AppScreen>
  );
}

function AdminProductsScreen({ navigation }) {
  const [loading, setLoadingState] = useState(true);
  const [products, setProductsState] = useState([]);
  async function load() { setLoadingState(true); try { const res = await listProducts(); setProductsState(res); } catch (e) { console.log(e); } finally { setLoadingState(false); } }
  useEffect(() => { load(); }, []);

  return (
    <AppScreen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}><Text style={{ fontSize: 22, fontWeight: '900' }}>Admin - Products</Text><Pressable style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#111827' }} onPress={() => navigation.reset({ index: 0, routes: [{ name: 'AdminLogin' }] })}><Text style={{ color: '#fff', fontWeight: '800' }}>Logout</Text></Pressable></View>
      <View style={{ gap: 10 }}>
        <PrimaryButton title="Add Product" onPress={() => navigation.navigate('AdminProductForm', { mode: 'add' })} />
        <PrimaryButton title="Add Sample Products" onPress={async () => { try { setLoadingState(true); const sample = [{ name: 'Classic T-Shirt', price: 19.99, description: 'Soft cotton daily essential.', image: 'https://images.unsplash.com/photo-1520975916090-3105956dac38?auto=format&fit=crop&w=800&q=60' }, { name: 'Warm Hoodie', price: 49.5, description: 'Cozy hoodie for cool evenings.', image: 'https://images.unsplash.com/photo-1520975693421-6f2b6c9b5d6b?auto=format&fit=crop&w=800&q=60' }, { name: 'Slim Pants', price: 39.0, description: 'Comfort fit with a clean look.', image: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=800&q=60' }]; await Promise.all(sample.map((p) => createProduct(p))); await load(); Alert.alert('Done', 'Sample products added.'); } catch (e) { console.log(e); Alert.alert('Failed', 'Could not add sample products.'); } finally { setLoadingState(false); } }} />
      </View>
      {loading ? <Text style={{ marginTop: 16 }}>Loading...</Text> : <FlatList style={{ marginTop: 16 }} data={products} keyExtractor={(item) => item.id} renderItem={({ item }) => (
        <View style={{ flexDirection: 'row', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#eee', marginBottom: 12, backgroundColor: '#fff' }}>
          <View style={{ flex: 1 }}><Text style={{ fontWeight: '900', fontSize: 15 }} numberOfLines={1}>{item.name}</Text><Text style={{ marginTop: 6, color: '#111827', fontWeight: '800' }}>${Number(item.price ?? 0).toFixed(2)}</Text><Text style={{ marginTop: 6, color: '#6b7280' }} numberOfLines={2}>{item.description || ''}</Text></View>
          <Pressable onPress={() => navigation.navigate('AdminProductForm', { mode: 'edit', product: item })} style={{ paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#2563eb', borderRadius: 12, alignSelf: 'flex-start' }}><Text style={{ color: '#fff', fontWeight: '900' }}>Edit</Text></Pressable>
          <Pressable onPress={() => Alert.alert('Delete product?', 'This cannot be undone.', [ { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteProduct(item.id); load(); } catch (e) { console.log(e); Alert.alert('Failed', 'Could not delete product.'); } } } ])} style={{ paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#ef4444', borderRadius: 12, alignSelf: 'flex-start' }}><Text style={{ color: '#fff', fontWeight: '900' }}>Del</Text></Pressable>
        </View>
      )} />}
    </AppScreen>
  );
}

function AdminProductFormScreen({ navigation, route }) {
  const mode = route?.params?.mode ?? 'add';
  const product = route?.params?.product ?? null;
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(String(product?.price ?? ''));
  const [description, setDescription] = useState(product?.description ?? '');
  const [imageUrl, setImageUrl] = useState(product?.image ?? '');
  const [pickedImageUri, setPickedImageUri] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (product) { setName(product?.name ?? ''); setPrice(String(product?.price ?? '')); setDescription(product?.description ?? ''); setImageUrl(product?.image ?? ''); setPickedImageUri(''); } }, [product]);

  const previewUri = pickedImageUri || imageUrl;
  const canSubmit = useMemo(() => { const p = Number(price); if (!name.trim()) return false; if (!Number.isFinite(p) || p < 0) return false; if (mode === 'add') return !!pickedImageUri; return !!(pickedImageUri || imageUrl); }, [name, price, pickedImageUri, imageUrl, mode]);

  async function ensurePickerPermissions() { const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access to choose an image.'); return false; } return true; }
  async function onPickImage() { const ok = await ensurePickerPermissions(); if (!ok) return; const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.85 }); if (result.canceled) return; const uri = result.assets?.[0]?.uri; if (!uri) return; setPickedImageUri(uri); setImageUrl(''); }
  async function onSave() { if (!canSubmit || saving || uploading) return; const n = name.trim(); const p = Number(price); try { setSaving(true); let finalImageUrl = imageUrl; if (pickedImageUri) { setUploading(true); finalImageUrl = await uploadImageToFirebase({ uri: pickedImageUri, filename: `product-${Date.now()}` }); } if (mode === 'edit' && product?.id) { await updateProduct(product.id, { name: n, price: p, description, image: finalImageUrl }); } else { await createProduct({ name: n, price: p, description, image: finalImageUrl }); } navigation.reset({ index: 0, routes: [{ name: 'AdminProducts' }] }); } catch (e) { console.log(e); Alert.alert('Save failed', 'Could not upload/save image. Check Firebase config and permissions.'); } finally { setUploading(false); setSaving(false); } }

  return (
    <AppScreen>
      <Text style={{ fontSize: 22, fontWeight: '900', marginBottom: 10 }}>{mode === 'edit' ? 'Edit Product' : 'Add Product'}</Text>
      <View style={{ width: '100%', marginBottom: 12 }}>{previewUri ? <Image source={{ uri: previewUri }} style={{ width: '100%', height: 180, borderRadius: 16 }} /> : <View style={{ width: '100%', height: 180, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f3f4f6' }}><Text style={{ color: '#6b7280', fontWeight: '700' }}>Pick an image</Text></View>}</View>
      <Pressable onPress={onPickImage} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: '#111827', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', marginBottom: 14 }} disabled={saving || uploading}><Text style={{ color: '#fff', fontWeight: '900' }}>{pickedImageUri ? 'Change Image' : 'Choose Image'}</Text></Pressable>
      <TextInputField label="Name" value={name} onChangeText={setName} placeholder="e.g. Hoodie" />
      <TextInputField label="Price" value={price} onChangeText={setPrice} placeholder="e.g. 25" keyboardType="numeric" />
      <TextInputField label="Description" value={description} onChangeText={setDescription} placeholder="Short description" />
      <View style={{ marginTop: 10 }}><PrimaryButton title={uploading ? 'Uploading...' : saving ? 'Saving...' : 'Save'} onPress={onSave} disabled={!canSubmit || uploading || saving} /></View>
      <View style={{ marginTop: 10, alignItems: 'center' }}><Text style={{ color: '#2563eb', fontWeight: '800' }} onPress={() => navigation.goBack()}>Back</Text></View>
    </AppScreen>
  );
}

// Navigation stacks
const Stack = createNativeStackNavigator();

function CustomerStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Login" component={CustomerLoginScreen} />
      <Stack.Screen name="Products" component={ProductsListScreen} />
      <Stack.Screen name="ProductDetails" component={ProductDetailsScreen} />
      <Stack.Screen name="Cart" component={CartScreen} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} />
    </Stack.Navigator>
  );
}

function AdminStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
      <Stack.Screen name="AdminProducts" component={AdminProductsScreen} />
      <Stack.Screen name="AdminProductForm" component={AdminProductFormScreen} />
    </Stack.Navigator>
  );
}

export default function AppRoot() {
  return (
    <>
      <StatusBar style="dark" />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Splash" component={SplashScreen} />
          <Stack.Screen name="Customer" component={CustomerStack} />
          <Stack.Screen name="Admin" component={AdminStack} />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

const stylesApp = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 12, backgroundColor: COLORS.bg },
  btn: { marginTop: 16, backgroundColor: COLORS.primary, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  btnDisabled: { opacity: 0.55 },
  txt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});

