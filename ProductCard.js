import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// NOTE: We now receive 'onAskPrice' as a prop!
// src/components/ProductCard.js

// 1. We added 'askPriceLabel' to the list of props here:
export default function ProductCard({ product, isLiked, onToggleLike, onPress, onAskPrice, askPriceLabel }) {

  const imageSource = product.imageUrl 
    ? { uri: product.imageUrl } 
    : (product.images && product.images.length > 0) 
        ? { uri: product.images[0] } 
        : { uri: 'https://via.placeholder.com/150' };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.imageContainer}>
        <Image source={imageSource} style={styles.image} />
        <TouchableOpacity style={styles.likeButton} onPress={() => onToggleLike(product)}>
            <Ionicons name={isLiked ? "heart" : "heart-outline"} size={24} color={isLiked ? "#D4AF37" : "#000"} />
        </TouchableOpacity>
      </View>

      <View style={styles.details}>
        <Text style={styles.brandTitle} numberOfLines={1}>{product.brand || "Brand Name"}</Text>
        <Text style={styles.productName} numberOfLines={1}>{product.name || product.title || "Jewelry Item"}</Text>

        <TouchableOpacity style={styles.whatsappButton} onPress={onAskPrice}>
            <Ionicons name="logo-whatsapp" size={18} color="white" style={{ marginRight: 8 }} />
            {/* 2. We use the custom label here instead of hardcoded text */}
            <Text style={styles.whatsappText}>
                {askPriceLabel || "Ask Price"} 
            </Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, backgroundColor: '#1A1A1A', margin: 5, borderRadius: 15, overflow: 'hidden', borderWidth: 1, borderColor: '#333', elevation: 3 },
  imageContainer: { height: 180, width: '100%', backgroundColor: '#000', position: 'relative' },
  image: { width: '100%', height: '100%', resizeMode: 'cover' },
  likeButton: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 20, padding: 6, zIndex: 10 },
  details: { padding: 12 },
  brandTitle: { color: 'white', fontSize: 14, fontWeight: 'bold', marginBottom: 4, textTransform: 'uppercase' },
  productName: { color: '#888', fontSize: 12, marginBottom: 10 },
  whatsappButton: { flexDirection: 'row', backgroundColor: '#25D366', paddingVertical: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  whatsappText: { color: 'white', fontSize: 12, fontWeight: 'bold' }
});