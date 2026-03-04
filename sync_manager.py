import firebase_admin
from firebase_admin import credentials, firestore
import pandas as pd
import datetime

# --- CONFIGURATION ---
EXCEL_FILE = 'database_data.xlsx'
KEY_FILE = 'serviceAccountKey.json'
SYSTEM_TABS = ['users', 'wholesalers'] 
# ---------------------

def initialize_firebase():
    if not firebase_admin._apps:
        cred = credentials.Certificate(KEY_FILE)
        firebase_admin.initialize_app(cred)
    return firestore.client()

def clean_data_for_upload(data):
    cleaned = {}
    for key, value in data.items():
        if not key or key == 'delete_row': continue 
        if pd.isna(value): continue
        if isinstance(value, pd.Timestamp):
            value = value.to_pydatetime()
        cleaned[key] = value
    return cleaned

def clean_df_for_excel(df):
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
             df[col] = df[col].apply(lambda x: x.replace(tzinfo=None) if pd.notnull(x) else x)
    return df

def flatten_arrays_in_df(df):
    if 'images' in df.columns:
        df['images'] = df['images'].apply(lambda x: ",".join([str(i) for i in x]) if isinstance(x, list) and x else "")
    return df

def get_next_sequence_number(db, brand_name):
    docs = db.collection('products').where('brand', '==', brand_name).stream()
    max_num = 0
    prefix = f"{brand_name}_product_"
    for doc in docs:
        doc_id = doc.id
        if doc_id.startswith(prefix):
            try:
                num_part = int(doc_id.split('_')[-1])
                if num_part > max_num: max_num = num_part
            except ValueError: continue
    return max_num + 1

def check_priority_conflict(db, new_priority, current_brand_id):
    if not new_priority: return False 
    docs = db.collection('wholesalers').where('priority', '==', new_priority).stream()
    for doc in docs:
        if doc.id != current_brand_id:
            print(f"⚠️  CONFLICT: Priority {new_priority} is already taken by '{doc.id}'.")
            return True 
    return False

# ===========================
# 1. DOWNLOAD
# ===========================
def download_data():
    db = initialize_firebase()
    print("--- ⬇️ STARTING DOWNLOAD FROM FIREBASE ---")
    
    with pd.ExcelWriter(EXCEL_FILE, engine='openpyxl') as writer:
        print("Fetching Users...")
        users_ref = db.collection('users').stream()
        users_data = [{'id': doc.id, **doc.to_dict()} for doc in users_ref]
        if users_data:
            df = pd.DataFrame(users_data)
            df = clean_df_for_excel(df)
            df.insert(0, 'delete_row', '') 
            df.to_excel(writer, sheet_name='users', index=False)
        else:
            pd.DataFrame(columns=['delete_row', 'id', 'email']).to_excel(writer, sheet_name='users', index=False)

        print("Fetching Wholesalers & Products...")
        wholesalers_ref = db.collection('wholesalers').stream()
        
        wholesalers_list = []
        for doc in wholesalers_ref:
            d = doc.to_dict()
            d['doc_id'] = doc.id
            wholesalers_list.append(d)
        
        wholesalers_list.sort(key=lambda x: int(x.get('priority', 9999)))

        for wholesaler_data in wholesalers_list:
            brand_name_id = wholesaler_data['doc_id']
            clean_brand_name = wholesaler_data.get('name', brand_name_id)
            if clean_brand_name == 'wholesalers': continue 
            
            print(f"  -> Processing Brand: {clean_brand_name}")
            
            products_ref = db.collection('products').where('brand', '==', clean_brand_name).stream()
            products_data = []
            for p in products_ref:
                p_data = p.to_dict()
                p_data.pop('brand', None)
                products_data.append({'id': p.id, **p_data})
            
            df = pd.DataFrame(products_data)
            df = flatten_arrays_in_df(df)

            df['wholesalerLocation'] = wholesaler_data.get('location', '')
            df['wholesalerLogo'] = wholesaler_data.get('logoUrl', '')
            df['wholesalerVideo'] = wholesaler_data.get('videoUrl', '')
            df['wholesalerPriority'] = wholesaler_data.get('priority', '')
            
            df.insert(0, 'delete_row', '')
            
            cols = ['delete_row', 'id', 'title', 'imageUrl', 'images', 'wholesalerPhone', 'wholesalerLocation', 'wholesalerPriority', 'wholesalerVideo', 'wholesalerLogo']
            for c in df.columns:
                if c not in cols: cols.append(c)
            df = df.reindex(columns=cols)
            
            df = clean_df_for_excel(df)
            df.to_excel(writer, sheet_name=clean_brand_name, index=False)

    print(f"\n✅ SUCCESS! Data saved to '{EXCEL_FILE}'.")

# ===========================
# 2. UPLOAD
# ===========================
def upload_data():
    db = initialize_firebase()
    print("--- ⬇️ STARTING UPLOAD TO FIREBASE ---")
    try: xls = pd.ExcelFile(EXCEL_FILE)
    except FileNotFoundError: print(f"Error: {EXCEL_FILE} not found."); return

    for sheet_name in xls.sheet_names:
        df = pd.read_excel(xls, sheet_name=sheet_name)
        if df.empty or sheet_name in SYSTEM_TABS: continue

        collection_name = 'products'
        brand_name = sheet_name
        wholesaler_doc_id = f"{brand_name}_profile"

        first_row = df.iloc[0]
        
        # Priority Check
        new_priority = first_row.get('wholesalerPriority')
        if pd.notnull(new_priority):
            try:
                new_priority = int(new_priority)
                if check_priority_conflict(db, new_priority, wholesaler_doc_id):
                    print(f"🛑 STOPPING: Fix duplicate priority for '{brand_name}' in Excel.")
                    return 
            except ValueError: new_priority = None

        # Check for ANY profile data to update
        loc = first_row.get('wholesalerLocation')
        logo = first_row.get('wholesalerLogo')
        video = first_row.get('wholesalerVideo')
        
        if pd.notnull(loc) or pd.notnull(logo) or pd.notnull(video) or pd.notnull(new_priority):
            w_data = {
                'name': brand_name,
                'location': loc,
                'logoUrl': logo,
                'videoUrl': video,
                'priority': new_priority
            }
            w_data = {k: v for k, v in w_data.items() if pd.notnull(v) and v != ""}
            
            db.collection('wholesalers').document(wholesaler_doc_id).set(w_data, merge=True)
            print(f"  Updated Profile: {wholesaler_doc_id}")

        print(f"  Processing Products for: {brand_name}")
        next_seq_num = get_next_sequence_number(db, brand_name)

        for index, row in df.iterrows():
            if pd.notnull(row.get('delete_row')) and str(row['delete_row']).lower() == 'x':
                doc_id = row.get('id')
                if doc_id and pd.notnull(doc_id):
                    db.collection(collection_name).document(str(doc_id)).delete()
                    print(f"    ❌ DELETED: {doc_id}")
                continue 

            # --- CRITICAL FIX: Check Raw Title BEFORE Processing ---
            # If the raw Excel row has no title, we skip it immediately.
            raw_title = row.get('title')
            if pd.isna(raw_title) or str(raw_title).strip() == "":
                # Skip this row (it's likely just for profile info)
                continue
            # -------------------------------------------------------

            data = clean_data_for_upload(row.to_dict())
            doc_id = data.pop('id', None)
            
            if 'images' in data and isinstance(data['images'], str):
                image_list = [url.strip() for url in data['images'].split(',') if url.strip()]
                data['images'] = image_list

            data['brand'] = brand_name
            data.pop('wholesalerLocation', None)
            data.pop('wholesalerLogo', None)
            data.pop('wholesalerPriority', None)
            data.pop('wholesalerVideo', None) 

            if doc_id and pd.notnull(doc_id):
                db.collection(collection_name).document(str(doc_id)).set(data, merge=True)
                print(f"    Updated: {doc_id}")
            else:
                new_custom_id = f"{brand_name}_product_{next_seq_num:04d}"
                db.collection(collection_name).document(new_custom_id).set(data)
                print(f"    ✅ Created: {new_custom_id}")
                next_seq_num += 1

if __name__ == "__main__":
    print("1. ⬇️  DOWNLOAD (Clean Start)")
    print("2. ⬆️  UPLOAD (Apply Changes)")
    choice = input("Enter 1 or 2: ")
    if choice == '1':
        confirm = input("Overwrite Excel? (y/n): ")
        if confirm.lower() == 'y': download_data()
    elif choice == '2':
        upload_data()