import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Image, ScrollView, TouchableOpacity, TextInput, Platform, StatusBar as RNStatusBar, Modal, Alert, FlatList, Linking, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import QRCode from 'react-native-qrcode-svg'; 
import * as Notifications from 'expo-notifications';
import { collection, onSnapshot, query, where, doc, getDoc, setDoc, updateDoc, increment } from "firebase/firestore";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";

// --- IMPORTS FROM OUR NEW CHUNKS ---
import { db, auth } from './src/config/firebase'; // Config
import { i18n } from './src/constants/translations'; // Translations
import AuthScreen from './src/screens/AuthScreen'; // Screen
import ProductDetailScreen from './src/screens/ProductDetailScreen'; // Screen
import ProductCard from './src/components/ProductCard'; // Component (Existing)

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export default function App() {
  // --- STATES ---
  const [lang, setLang] = useState('en'); 
  const t = (key) => i18n[lang] ? (i18n[lang][key] || key) : key;

  const [showSplash, setShowSplash] = useState(false);
  const [user, setUser] = useState(null);
  const [isApproved, setIsApproved] = useState(false); 
  const [authLoading, setAuthLoading] = useState(true); 

  const [activeTab, setActiveTab] = useState('home'); 
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  
  const [searchText, setSearchText] = useState('');
  const [wholesalers, setWholesalers] = useState([]);
  const [products, setProducts] = useState([]);
  const [savedItems, setSavedItems] = useState([]); 
  const [loading, setLoading] = useState(true);

  // QR & Deep Link State
  const [showBrandQR, setShowBrandQR] = useState(false);
  const [qrBrandData, setQrBrandData] = useState(null); 
  const [pendingBrandName, setPendingBrandName] = useState(null); 

  // --- 1. AUTH LOGIC ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
            const userRef = doc(db, "users", currentUser.uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists() && userSnap.data().approved === true) {
                setIsApproved(true);
            } else {
                setIsApproved(false); 
            }
        } catch (e) { setIsApproved(false); }
      } else {
        setUser(null);
        setIsApproved(false);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAuth = async (email, password, isRegistering, confirmPassword) => {
    if (email === '' || password === '') { Alert.alert("Error", "Please fill in all fields."); return; }
    try {
        if (isRegistering) {
            if (password !== confirmPassword) { Alert.alert("Error", "Passwords do not match!"); return; }
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await setDoc(doc(db, "users", userCredential.user.uid), { email: email, approved: false, createdAt: new Date() });
            Alert.alert("Success", "Account created! Waiting for Admin Approval.");
        } else {
            setShowSplash(true); 
            await signInWithEmailAndPassword(auth, email, password);
            setTimeout(() => { setShowSplash(false); }, 2000); 
        }
    } catch (error) { setShowSplash(false); Alert.alert("Authentication Error", error.message); }
  };

  const handleLogout = () => {
      Alert.alert(t('logoutTitle'), t('logoutMsg'), [
          { text: t('cancel'), style: "cancel" },
          { text: t('confirmLogout'), style: "destructive", onPress: async () => { await signOut(auth); setSelectedBrand(null); setActiveTab('home'); }}
      ]);
  };

  // --- 2. DATA LOGIC ---
  useEffect(() => {
    if (!isApproved || !user) return; 
    const unsub = onSnapshot(collection(db, "wholesalers"), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => (a.priority || 999) - (b.priority || 999));
      setWholesalers(data);
      setLoading(false);
    });
    return () => unsub();
  }, [isApproved, user]);

  useEffect(() => {
    if (!selectedBrand) { setProducts([]); return; }
    setLoading(true);
    const q = query(collection(db, "products"), where("brand", "==", selectedBrand.name));
    const unsub = onSnapshot(q, (snap) => {
      setProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [selectedBrand]);

  // Analytics View Count
  useEffect(() => {
    if (selectedProduct && selectedProduct.id) {
        const productRef = doc(db, "products", selectedProduct.id);
        updateDoc(productRef, { viewCount: increment(1) }).catch(e => console.log(e));
    }
  }, [selectedProduct]);

  // --- 3. ACTIONS ---
  const handleAskPrice = (product) => {
    const productRef = doc(db, "products", product.id);
    updateDoc(productRef, { whatsappCount: increment(1) });

    const brandObj = wholesalers.find(w => w.name === product.brand);
    let targetPhone = product.wholesalerPhone || (brandObj ? (brandObj.phone || brandObj.phoneNumber) : null);

    if (!targetPhone) { Alert.alert("Contact Info Missing", "Sorry, this brand has not provided a WhatsApp number yet."); return; }

    const message = `Hello, I am interested in: ${product.brand} - ${product.name} (Code: ${product.code || 'N/A'})`;
    const url = `whatsapp://send?phone=${targetPhone}&text=${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() => alert("Make sure WhatsApp is installed!"));
  };

  const toggleSave = (product) => {
    const isAlreadySaved = savedItems.some(saved => saved.id === product.id);
    if (isAlreadySaved) { setSavedItems(savedItems.filter(saved => saved.id !== product.id)); } 
    else { setSavedItems([...savedItems, product]); }
  };

  const handleDeepLink = (event) => { /* Same deep link logic as before */ 
    if (event.url.includes('brand/')) {
        const parts = event.url.split('brand/');
        if (parts.length > 1) {
            let brandName = parts[1].split('/')[0].split('?')[0];
            setPendingBrandName(decodeURIComponent(brandName));
        }
    }
  };

  useEffect(() => {
      const subscription = Linking.addEventListener('url', handleDeepLink);
      Linking.getInitialURL().then((url) => { if (url) handleDeepLink({ url }); });
      return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (pendingBrandName && wholesalers.length > 0) {
       const target = wholesalers.find(w => w.name.replace(/\s+/g, '').toLowerCase() === pendingBrandName.toLowerCase());
       if (target) { setSelectedBrand(target); setPendingBrandName(null); }
    }
  }, [pendingBrandName, wholesalers]);

  // --- 4. RENDERERS ---
  
  // A. Splash
  if (showSplash) {
    return (<View style={{ flex: 1, backgroundColor: 'black' }}><Image source={require('./assets/pending_splash.jpg')} style={{ width: '100%', height: '100%' }} resizeMode="cover" /></View>);
  }

  // B. Loading / Auth
  if (authLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#FFFFFF" /></View>;
  
  if (!user) {
    return <AuthScreen onAuth={handleAuth} t={t} changeLang={() => setLang(lang === 'en' ? 'tr' : 'en')} lang={lang} />;
  }

  if (user && !isApproved) {
      return (
        <View style={styles.loginContainer}>
            <Ionicons name="hourglass" size={60} color="#FFFFFF" style={{marginBottom: 20}} />
            <Text style={styles.loginTitle}>PENDING APPROVAL</Text>
            <Text style={{color: '#ccc', textAlign: 'center', paddingHorizontal: 40, marginBottom: 30, lineHeight: 22}}>Thank you for registering. {"\n"}Your account ({user.email}) is currently under review.{"\n\n"}Access will be granted by Admin.</Text>
            <TouchableOpacity style={styles.loginBtn} onPress={handleLogout}><Text style={styles.loginBtnText}>LOG OUT</Text></TouchableOpacity>
            <StatusBar style="light" />
        </View>
      );
  }

  // C. Main Content Logic
  const renderContent = () => {
    // 1. Product Detail Screen
    if (selectedProduct) { 
        return <ProductDetailScreen 
            product={selectedProduct} t={t} 
            onClose={() => setSelectedProduct(null)} 
            onSave={toggleSave} savedItems={savedItems} 
            onAskPrice={handleAskPrice} 
            onViewBrand={(brandName) => {
                const brandObj = wholesalers.find(w => w.name === brandName);
                if (brandObj) { setActiveTab('home'); setSelectedBrand(brandObj); setSelectedProduct(null); }
            }}
        />; 
    }

    // 2. Saved Screen
    if (activeTab === 'saved') {
        return (
            <ScrollView contentContainerStyle={styles.scroll}>
                <Text style={styles.sectionTitle}>Saved Collection</Text>
                {savedItems.map(item => (
                    <ProductCard key={item.id} product={item} isLiked={true} onToggleLike={toggleSave} onPress={() => setSelectedProduct(item)} onAskPrice={() => handleAskPrice(item)} askPriceLabel={t('askPriceShort')} />
                ))}
            </ScrollView>
        );
    }

    // 3. Home Screen (Brand List)
    if (!selectedBrand) {
        const filteredBrands = wholesalers.filter(b => b.name.toLowerCase().includes(searchText.toLowerCase()));
        return (
            <View style={{flex: 1}}>
                <View style={styles.searchContainer}>
                    <Ionicons name="search" size={20} color="#666" style={{marginRight: 10}} />
                    <TextInput style={styles.searchInput} placeholder={t('searchPlaceholder')} placeholderTextColor="#666" value={searchText} onChangeText={setSearchText} />
                    {searchText.length > 0 && (<TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={20} color="#666" /></TouchableOpacity>)}
                </View>
                <Image source={require('./assets/main-header-logo.png')} style={styles.mainHeaderLogo} />
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
                    {filteredBrands.map((brand) => (
                        <View key={brand.id} style={{ marginBottom: 30 }}> 
                            <TouchableOpacity style={styles.heroCard} onPress={() => { setSelectedBrand(brand); setIsVideoPlaying(false); }} activeOpacity={0.95}>
                                <Image source={(brand.logoUrl && typeof brand.logoUrl === 'string') ? { uri: brand.logoUrl } : require('./assets/logo.png')} style={styles.heroImage} />
                                <View style={styles.brandInfo}>
                                    <Text style={styles.heroBrandName}>{brand.name}</Text>
                                    <View style={styles.locationBadge}><Ionicons name="location-sharp" size={14} color="#FFFFFF" /><Text style={styles.heroLocation}>{brand.location || "Turkey"}</Text></View>
                                </View>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.qrButton} onPress={() => {
                                    const cleanName = brand.name.replace(/\s+/g, '');
                                    setQrBrandData({ name: brand.name, link: `gbm://brand/${cleanName}` });
                                    setShowBrandQR(true);
                                }}><Ionicons name="qr-code" size={20} color="black" /></TouchableOpacity>
                        </View>
                    ))}
                </ScrollView>
            </View>
        );
    }

    // 4. Products List (Inside a Brand)
    return (
        <View style={{flex: 1, backgroundColor: '#000'}}>
            <View style={styles.shopHeaderCompact}>
                <TouchableOpacity onPress={() => setSelectedBrand(null)} style={{padding: 10}}><Ionicons name="arrow-back" size={24} color="#FFFFFF" /></TouchableOpacity>
            </View>
            {loading ? (<View style={styles.center}><ActivityIndicator color="#FFFFFF" size="large"/></View>) : (
                <FlatList
                    data={products} keyExtractor={(item) => item.id} numColumns={2} showsVerticalScrollIndicator={false} contentContainerStyle={styles.gridContainer} 
                    ListHeaderComponent={
                        <View style={{ marginBottom: 20 }}>
                            <Image source={{ uri: selectedBrand.logoUrl }} style={styles.brandBannerImage} />
                            {selectedBrand.videoUrl ? (
                                <View style={styles.videoContainer}>
                                    <Video style={{ width: '100%', height: '100%' }} source={{ uri: selectedBrand.videoUrl }} useNativeControls={true} resizeMode={ResizeMode.COVER} isLooping={true} shouldPlay={false} onPlaybackStatusUpdate={status => setIsVideoPlaying(status.isPlaying)} />
                                    {!isVideoPlaying && (<View style={styles.playOverlay} pointerEvents="none"><View style={styles.playBtnCircle}><Ionicons name="play" size={40} color="white" style={{ marginLeft: 5 }} /></View></View>)}
                                </View>
                            ) : null}
                            <View style={styles.brandBannerOverlay}>
                                <Text style={styles.brandBannerTitle}>{selectedBrand.name}</Text>
                                <View style={styles.locationBadge}><Ionicons name="location-sharp" size={14} color="#FFFFFF" /><Text style={styles.heroLocation}>{selectedBrand.location || "Turkey"}</Text></View>
                            </View>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <View style={{ flex: 1, padding: 1 }}>
                             <ProductCard product={item} isLiked={savedItems.some(saved => saved.id === item.id)} onToggleLike={toggleSave} onPress={() => setSelectedProduct(item)} onAskPrice={() => handleAskPrice(item)} askPriceLabel={t('askPriceShort')} />
                        </View>
                    )}
                    ListEmptyComponent={<Text style={styles.emptyText}>No products found for this brand.</Text>}
                />
            )}
        </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.androidSafe}>
        <View style={styles.contentArea}>{renderContent()}</View>
        <View style={styles.bottomBar}>
            {/* Tabs */}
            <TouchableOpacity style={styles.tabItem} onPress={() => { setActiveTab('home'); setSelectedBrand(null); setSelectedProduct(null); }}>
                <Ionicons name="home" size={24} color={activeTab === 'home' ? '#FFFFFF' : '#666'} />
                <Text style={[styles.tabText, { color: activeTab === 'home' ? '#FFFFFF' : '#666' }]}>{t('home')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tabItem} onPress={() => { setActiveTab('saved'); setSelectedProduct(null); }}>
                <Ionicons name="heart" size={24} color={activeTab === 'saved' ? '#FFFFFF' : '#666'} />
                <Text style={[styles.tabText, { color: activeTab === 'saved' ? '#FFFFFF' : '#666' }]}>{t('saved')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tabItem} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={24} color="#666" />
                <Text style={[styles.tabText, { color: '#666' }]}>{t('logout')}</Text>
            </TouchableOpacity>
        </View>

        {/* Brand QR Modal */}
        <Modal animationType="fade" transparent={true} visible={showBrandQR} onRequestClose={() => setShowBrandQR(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.qrBox}>
              <Text style={styles.qrTitle}>BRAND QR CODE</Text>
              <View style={{marginVertical: 20}}>{qrBrandData && (<QRCode value={qrBrandData.link} size={200} />)}</View>
              {qrBrandData && <Text style={styles.qrSub}>{qrBrandData.name}</Text>}
              <TouchableOpacity onPress={() => setShowBrandQR(false)} style={[styles.closeBtn, {marginTop: 20}]}><Text style={styles.closeText}>CLOSE</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  contentArea: { flex: 1 },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  androidSafe: { paddingTop: Platform.OS === "android" ? RNStatusBar.currentHeight + 10 : 0, flex: 1, backgroundColor: "black" },
  shopHeaderCompact: { flexDirection: 'row', alignItems: 'center', paddingTop: 10, paddingHorizontal: 10, backgroundColor: '#000', zIndex: 10, marginTop: 40 },
  brandBannerImage: { width: '100%', height: 220, resizeMode: 'cover', borderRadius: 12 },
  brandBannerOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', padding: 15, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  brandBannerTitle: { color: 'white', fontSize: 28, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 },
  gridContainer: { padding: 10, paddingBottom: 100 },
  emptyText: { color: '#666', textAlign: 'center', marginTop: 50 },
  videoContainer: { width: '100%', height: 200, marginTop: 10, borderRadius: 12, overflow: 'hidden', backgroundColor: 'black', position: 'relative' },
  playOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  playBtnCircle: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 50, padding: 15 },
  loginContainer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 20 },
  loginTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: 'bold', letterSpacing: 1, textAlign: 'center', marginBottom: 10 },
  loginBtn: { borderColor: '#FFFFFF', borderWidth: 1, paddingHorizontal: 40, paddingVertical: 15, width: '100%', alignItems: 'center' },
  loginBtnText: { color: '#FFFFFF', fontWeight: 'bold', letterSpacing: 2 },
  heroCard: { width: '100%', borderRadius: 16, overflow: 'hidden', backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#333', position: 'relative', marginBottom: -5 },
  heroImage: { width: '100%', height: 250, resizeMode: 'cover' },
  brandInfo: { padding: 16, borderTopWidth: 1, borderTopColor: '#222' },
  heroBrandName: { color: 'white', fontSize: 22, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  locationBadge: { flexDirection: 'row', alignItems: 'center' },
  heroLocation: { color: '#888', fontWeight: '600', fontSize: 13, marginLeft: 4, textTransform: 'uppercase' },
  qrButton: { position: 'absolute', top: 15, right: 15, backgroundColor: '#FFFFFF', padding: 8, borderRadius: 50, zIndex: 10, elevation: 5 },
  searchContainer: { flexDirection: 'row', backgroundColor: '#1A1A1A', marginTop: 60, marginHorizontal: 20, marginBottom: 20, padding: 12, borderRadius: 8, alignItems: 'center' },
  searchInput: { color: 'white', flex: 1, fontSize: 16 },
  mainHeaderLogo: { width: '90%', height: 80, resizeMode: 'contain', alignSelf: 'center', marginBottom: 20, marginTop: 10 },
  scroll: { padding: 20 },
  sectionTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold', marginBottom: 20, marginTop: 50 },
  bottomBar: { flexDirection: 'row', height: 90, backgroundColor: '#000', borderTopWidth: 1, borderTopColor: '#222', paddingBottom: 30, alignItems: 'center', justifyContent: 'space-around' },
  tabItem: { alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 10, marginTop: 4, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  qrBox: { width: 300, backgroundColor: 'white', padding: 20, borderRadius: 20, alignItems: 'center' },
  qrTitle: { fontSize: 18, fontWeight: 'bold', color: 'black', letterSpacing: 1 },
  qrSub: { fontSize: 16, fontWeight: 'bold', color: 'black', marginTop: 5 },
  closeBtn: { backgroundColor: 'black', paddingHorizontal: 30, paddingVertical: 10, borderRadius: 20 },
  closeText: { color: '#FFFFFF', fontWeight: 'bold' },
});