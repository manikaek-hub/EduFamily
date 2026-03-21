"""
Assistant Familial - Application de gestion quotidienne
Une application pour gérer les activités des enfants, les engagements familiaux et les factures
"""

import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext
from datetime import datetime, timedelta
import json
import os
import platform

class AssistantFamilial:
    def __init__(self, root):
        self.root = root
        self.root.title("Assistant Familial 👨‍👩‍👧‍👦")
        self.root.geometry("900x700")
        
        # Fichier de sauvegarde des données
        self.data_file = "family_data.json"
        self.load_data()
        
        # Créer l'interface
        self.create_widgets()
        
    def load_data(self):
        """Charge les données sauvegardées"""
        if os.path.exists(self.data_file):
            with open(self.data_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                self.activites_enfants = data.get('activites_enfants', [])
                self.engagements = data.get('engagements', [])
                self.factures = data.get('factures', [])
        else:
            self.activites_enfants = []
            self.engagements = []
            self.factures = []
    
    def save_data(self):
        """Sauvegarde les données"""
        data = {
            'activites_enfants': self.activites_enfants,
            'engagements': self.engagements,
            'factures': self.factures
        }
        with open(self.data_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    
    def envoyer_notification(self, titre, message):
        """Envoie une notification desktop"""
        try:
            if platform.system() == "Darwin":  # Mac
                # Échapper les caractères spéciaux
                message_escape = message.replace('"', '\\"').replace("'", "\\'")
                titre_escape = titre.replace('"', '\\"').replace("'", "\\'")
                commande = f'''osascript -e 'display notification "{message_escape}" with title "{titre_escape}"' '''
                os.system(commande)
            elif platform.system() == "Windows":
                # Pour Windows (notification basique)
                pass  # Pourrait utiliser win10toast
            elif platform.system() == "Linux":
                # Pour Linux
                os.system(f'notify-send "{titre}" "{message}"')
        except Exception as e:
            print(f"Erreur notification : {e}")
    
    def create_widgets(self):
        """Crée l'interface utilisateur"""
        # Titre
        title_frame = tk.Frame(self.root, bg="#4A90E2", height=60)
        title_frame.pack(fill=tk.X)
        title_frame.pack_propagate(False)
        
        title_label = tk.Label(title_frame, text="🏠 Assistant Familial", 
                              font=("Arial", 20, "bold"), 
                              bg="#4A90E2", fg="white")
        title_label.pack(pady=15)
        
        # Notebook (onglets)
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Onglet 1: Activités des enfants
        self.tab_enfants = tk.Frame(self.notebook)
        self.notebook.add(self.tab_enfants, text="👶 Activités Enfants")
        self.create_enfants_tab()
        
        # Onglet 2: Engagements famille/amis
        self.tab_engagements = tk.Frame(self.notebook)
        self.notebook.add(self.tab_engagements, text="👨‍👩‍👧 Engagements")
        self.create_engagements_tab()
        
        # Onglet 3: Factures
        self.tab_factures = tk.Frame(self.notebook)
        self.notebook.add(self.tab_factures, text="💰 Factures")
        self.create_factures_tab()
        
        # Onglet 4: Tableau de bord
        self.tab_dashboard = tk.Frame(self.notebook)
        self.notebook.add(self.tab_dashboard, text="📊 Tableau de bord")
        self.create_dashboard_tab()
    
    def create_enfants_tab(self):
        """Crée l'onglet des activités des enfants"""
        # Formulaire d'ajout
        form_frame = tk.LabelFrame(self.tab_enfants, text="Ajouter une activité", 
                                   font=("Arial", 11, "bold"), padx=10, pady=10)
        form_frame.pack(fill=tk.X, padx=10, pady=10)
        
        tk.Label(form_frame, text="Nom de l'enfant:").grid(row=0, column=0, sticky=tk.W, pady=5)
        self.enfant_nom = tk.Entry(form_frame, width=30)
        self.enfant_nom.grid(row=0, column=1, pady=5)
        
        tk.Label(form_frame, text="Activité:").grid(row=1, column=0, sticky=tk.W, pady=5)
        self.enfant_activite = tk.Entry(form_frame, width=30)
        self.enfant_activite.grid(row=1, column=1, pady=5)
        
        tk.Label(form_frame, text="Date et heure:").grid(row=2, column=0, sticky=tk.W, pady=5)
        self.enfant_date = tk.Entry(form_frame, width=30)
        self.enfant_date.insert(0, datetime.now().strftime("%d/%m/%Y %H:%M"))
        self.enfant_date.grid(row=2, column=1, pady=5)
        
        tk.Label(form_frame, text="Notes:").grid(row=3, column=0, sticky=tk.W, pady=5)
        self.enfant_notes = tk.Entry(form_frame, width=30)
        self.enfant_notes.grid(row=3, column=1, pady=5)
        
        btn_ajouter = tk.Button(form_frame, text="➕ Ajouter", 
                               command=self.ajouter_activite_enfant,
                               bg="#4CAF50", fg="white", font=("Arial", 10, "bold"))
        btn_ajouter.grid(row=4, column=0, columnspan=2, pady=10)
        
        # Liste des activités
        list_frame = tk.LabelFrame(self.tab_enfants, text="Activités programmées", 
                                   font=("Arial", 11, "bold"))
        list_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        self.enfants_list = scrolledtext.ScrolledText(list_frame, height=15, 
                                                      font=("Arial", 10))
        self.enfants_list.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        self.refresh_enfants_list()
    
    def create_engagements_tab(self):
        """Crée l'onglet des engagements"""
        form_frame = tk.LabelFrame(self.tab_engagements, text="Ajouter un engagement", 
                                   font=("Arial", 11, "bold"), padx=10, pady=10)
        form_frame.pack(fill=tk.X, padx=10, pady=10)
        
        tk.Label(form_frame, text="Titre:").grid(row=0, column=0, sticky=tk.W, pady=5)
        self.engagement_titre = tk.Entry(form_frame, width=30)
        self.engagement_titre.grid(row=0, column=1, pady=5)
        
        tk.Label(form_frame, text="Avec:").grid(row=1, column=0, sticky=tk.W, pady=5)
        self.engagement_avec = tk.Entry(form_frame, width=30)
        self.engagement_avec.grid(row=1, column=1, pady=5)
        
        tk.Label(form_frame, text="Date et heure:").grid(row=2, column=0, sticky=tk.W, pady=5)
        self.engagement_date = tk.Entry(form_frame, width=30)
        self.engagement_date.insert(0, datetime.now().strftime("%d/%m/%Y %H:%M"))
        self.engagement_date.grid(row=2, column=1, pady=5)
        
        tk.Label(form_frame, text="Lieu:").grid(row=3, column=0, sticky=tk.W, pady=5)
        self.engagement_lieu = tk.Entry(form_frame, width=30)
        self.engagement_lieu.grid(row=3, column=1, pady=5)
        
        btn_ajouter = tk.Button(form_frame, text="➕ Ajouter", 
                               command=self.ajouter_engagement,
                               bg="#2196F3", fg="white", font=("Arial", 10, "bold"))
        btn_ajouter.grid(row=4, column=0, columnspan=2, pady=10)
        
        list_frame = tk.LabelFrame(self.tab_engagements, text="Engagements à venir", 
                                   font=("Arial", 11, "bold"))
        list_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        self.engagements_list = scrolledtext.ScrolledText(list_frame, height=15, 
                                                          font=("Arial", 10))
        self.engagements_list.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        self.refresh_engagements_list()
    
    def create_factures_tab(self):
        """Crée l'onglet des factures"""
        form_frame = tk.LabelFrame(self.tab_factures, text="Ajouter une facture", 
                                   font=("Arial", 11, "bold"), padx=10, pady=10)
        form_frame.pack(fill=tk.X, padx=10, pady=10)
        
        tk.Label(form_frame, text="Description:").grid(row=0, column=0, sticky=tk.W, pady=5)
        self.facture_desc = tk.Entry(form_frame, width=30)
        self.facture_desc.grid(row=0, column=1, pady=5)
        
        tk.Label(form_frame, text="Montant (€):").grid(row=1, column=0, sticky=tk.W, pady=5)
        self.facture_montant = tk.Entry(form_frame, width=30)
        self.facture_montant.grid(row=1, column=1, pady=5)
        
        tk.Label(form_frame, text="Date d'échéance:").grid(row=2, column=0, sticky=tk.W, pady=5)
        self.facture_date = tk.Entry(form_frame, width=30)
        self.facture_date.insert(0, (datetime.now() + timedelta(days=30)).strftime("%d/%m/%Y"))
        self.facture_date.grid(row=2, column=1, pady=5)
        
        tk.Label(form_frame, text="Statut:").grid(row=3, column=0, sticky=tk.W, pady=5)
        self.facture_statut = ttk.Combobox(form_frame, width=27, 
                                           values=["À payer", "Payée", "En retard"])
        self.facture_statut.set("À payer")
        self.facture_statut.grid(row=3, column=1, pady=5)
        
        btn_ajouter = tk.Button(form_frame, text="➕ Ajouter", 
                               command=self.ajouter_facture,
                               bg="#FF9800", fg="white", font=("Arial", 10, "bold"))
        btn_ajouter.grid(row=4, column=0, columnspan=2, pady=10)
        
        list_frame = tk.LabelFrame(self.tab_factures, text="Liste des factures", 
                                   font=("Arial", 11, "bold"))
        list_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        self.factures_list = scrolledtext.ScrolledText(list_frame, height=15, 
                                                       font=("Arial", 10))
        self.factures_list.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        self.refresh_factures_list()
    
    def create_dashboard_tab(self):
        """Crée le tableau de bord"""
        dashboard_frame = tk.Frame(self.tab_dashboard)
        dashboard_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=20)
        
        self.dashboard_text = scrolledtext.ScrolledText(dashboard_frame, 
                                                        font=("Arial", 11),
                                                        wrap=tk.WORD)
        self.dashboard_text.pack(fill=tk.BOTH, expand=True)
        
        btn_refresh = tk.Button(dashboard_frame, text="🔄 Actualiser", 
                               command=self.refresh_dashboard,
                               bg="#9C27B0", fg="white", font=("Arial", 10, "bold"))
        btn_refresh.pack(pady=10)
        
        self.refresh_dashboard()
    
    def ajouter_activite_enfant(self):
        """Ajoute une activité pour un enfant"""
        activite = {
            'nom': self.enfant_nom.get(),
            'activite': self.enfant_activite.get(),
            'date': self.enfant_date.get(),
            'notes': self.enfant_notes.get()
        }
        
        if not activite['nom'] or not activite['activite']:
            messagebox.showwarning("Attention", "Veuillez remplir au moins le nom et l'activité")
            return
        
        self.activites_enfants.append(activite)
        self.save_data()
        self.refresh_enfants_list()
        
        # Vider les champs
        self.enfant_nom.delete(0, tk.END)
        self.enfant_activite.delete(0, tk.END)
        self.enfant_notes.delete(0, tk.END)
        self.enfant_date.delete(0, tk.END)
        self.enfant_date.insert(0, datetime.now().strftime("%d/%m/%Y %H:%M"))
        
        messagebox.showinfo("Succès", "Activité ajoutée avec succès! 🎉")
        
        # Envoyer notification desktop
        self.envoyer_notification(
            f"🎯 {activite['nom']} - {activite['activite']}", 
            f"Programmé le {activite['date']}"
        )
    
    def ajouter_engagement(self):
        """Ajoute un engagement"""
        engagement = {
            'titre': self.engagement_titre.get(),
            'avec': self.engagement_avec.get(),
            'date': self.engagement_date.get(),
            'lieu': self.engagement_lieu.get()
        }
        
        if not engagement['titre']:
            messagebox.showwarning("Attention", "Veuillez remplir au moins le titre")
            return
        
        self.engagements.append(engagement)
        self.save_data()
        self.refresh_engagements_list()
        
        # Vider les champs
        self.engagement_titre.delete(0, tk.END)
        self.engagement_avec.delete(0, tk.END)
        self.engagement_lieu.delete(0, tk.END)
        self.engagement_date.delete(0, tk.END)
        self.engagement_date.insert(0, datetime.now().strftime("%d/%m/%Y %H:%M"))
        
        messagebox.showinfo("Succès", "Engagement ajouté avec succès! 📅")
        
        # Envoyer notification desktop
        self.envoyer_notification(
            f"📅 {engagement['titre']}", 
            f"Avec {engagement['avec']} le {engagement['date']}"
        )
    
    def ajouter_facture(self):
        """Ajoute une facture"""
        try:
            montant = float(self.facture_montant.get())
        except ValueError:
            messagebox.showwarning("Attention", "Le montant doit être un nombre")
            return
        
        facture = {
            'description': self.facture_desc.get(),
            'montant': montant,
            'date': self.facture_date.get(),
            'statut': self.facture_statut.get()
        }
        
        if not facture['description']:
            messagebox.showwarning("Attention", "Veuillez remplir la description")
            return
        
        self.factures.append(facture)
        self.save_data()
        self.refresh_factures_list()
        
        # Vider les champs
        self.facture_desc.delete(0, tk.END)
        self.facture_montant.delete(0, tk.END)
        self.facture_date.delete(0, tk.END)
        self.facture_date.insert(0, (datetime.now() + timedelta(days=30)).strftime("%d/%m/%Y"))
        
        messagebox.showinfo("Succès", "Facture ajoutée avec succès! 💳")
        
        # Envoyer notification desktop
        self.envoyer_notification(
            f"💰 Facture : {facture['description']}", 
            f"{facture['montant']}€ - Échéance : {facture['date']}"
        )
    
    def refresh_enfants_list(self):
        """Actualise la liste des activités des enfants"""
        self.enfants_list.delete(1.0, tk.END)
        
        if not self.activites_enfants:
            self.enfants_list.insert(tk.END, "Aucune activité programmée pour le moment.\n")
            return
        
        for i, activite in enumerate(self.activites_enfants, 1):
            self.enfants_list.insert(tk.END, f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
            self.enfants_list.insert(tk.END, f"📌 Activité #{i}\n")
            self.enfants_list.insert(tk.END, f"👤 Enfant: {activite['nom']}\n")
            self.enfants_list.insert(tk.END, f"🎯 Activité: {activite['activite']}\n")
            self.enfants_list.insert(tk.END, f"📅 Date: {activite['date']}\n")
            if activite['notes']:
                self.enfants_list.insert(tk.END, f"📝 Notes: {activite['notes']}\n")
            self.enfants_list.insert(tk.END, "\n")
    
    def refresh_engagements_list(self):
        """Actualise la liste des engagements"""
        self.engagements_list.delete(1.0, tk.END)
        
        if not self.engagements:
            self.engagements_list.insert(tk.END, "Aucun engagement programmé pour le moment.\n")
            return
        
        for i, engagement in enumerate(self.engagements, 1):
            self.engagements_list.insert(tk.END, f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
            self.engagements_list.insert(tk.END, f"📌 Engagement #{i}\n")
            self.engagements_list.insert(tk.END, f"📋 Titre: {engagement['titre']}\n")
            self.engagements_list.insert(tk.END, f"👥 Avec: {engagement['avec']}\n")
            self.engagements_list.insert(tk.END, f"📅 Date: {engagement['date']}\n")
            if engagement['lieu']:
                self.engagements_list.insert(tk.END, f"📍 Lieu: {engagement['lieu']}\n")
            self.engagements_list.insert(tk.END, "\n")
    
    def refresh_factures_list(self):
        """Actualise la liste des factures"""
        self.factures_list.delete(1.0, tk.END)
        
        if not self.factures:
            self.factures_list.insert(tk.END, "Aucune facture enregistrée pour le moment.\n")
            return
        
        total = 0
        for i, facture in enumerate(self.factures, 1):
            self.factures_list.insert(tk.END, f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
            self.factures_list.insert(tk.END, f"📌 Facture #{i}\n")
            self.factures_list.insert(tk.END, f"📄 Description: {facture['description']}\n")
            self.factures_list.insert(tk.END, f"💰 Montant: {facture['montant']:.2f} €\n")
            self.factures_list.insert(tk.END, f"📅 Échéance: {facture['date']}\n")
            
            statut_emoji = {"À payer": "⏳", "Payée": "✅", "En retard": "⚠️"}
            emoji = statut_emoji.get(facture['statut'], "")
            self.factures_list.insert(tk.END, f"{emoji} Statut: {facture['statut']}\n")
            self.factures_list.insert(tk.END, "\n")
            
            if facture['statut'] != "Payée":
                total += facture['montant']
        
        self.factures_list.insert(tk.END, f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
        self.factures_list.insert(tk.END, f"💳 TOTAL À PAYER: {total:.2f} €\n")
    
    def refresh_dashboard(self):
        """Actualise le tableau de bord"""
        self.dashboard_text.delete(1.0, tk.END)
        
        now = datetime.now()
        self.dashboard_text.insert(tk.END, "╔══════════════════════════════════════════════╗\n")
        self.dashboard_text.insert(tk.END, "║     📊 TABLEAU DE BORD - VUE D'ENSEMBLE     ║\n")
        self.dashboard_text.insert(tk.END, "╚══════════════════════════════════════════════╝\n\n")
        
        self.dashboard_text.insert(tk.END, f"📅 Date: {now.strftime('%d/%m/%Y à %H:%M')}\n\n")
        
        # Statistiques
        self.dashboard_text.insert(tk.END, "═══ STATISTIQUES ═══\n\n")
        self.dashboard_text.insert(tk.END, f"👶 Activités enfants programmées: {len(self.activites_enfants)}\n")
        self.dashboard_text.insert(tk.END, f"👨‍👩‍👧 Engagements à venir: {len(self.engagements)}\n")
        self.dashboard_text.insert(tk.END, f"💰 Factures enregistrées: {len(self.factures)}\n\n")
        
        # Factures
        total_a_payer = sum(f['montant'] for f in self.factures if f['statut'] != "Payée")
        factures_en_retard = sum(1 for f in self.factures if f['statut'] == "En retard")
        
        self.dashboard_text.insert(tk.END, "═══ FINANCES ═══\n\n")
        self.dashboard_text.insert(tk.END, f"💳 Total à payer: {total_a_payer:.2f} €\n")
        if factures_en_retard > 0:
            self.dashboard_text.insert(tk.END, f"⚠️ Factures en retard: {factures_en_retard}\n")
        else:
            self.dashboard_text.insert(tk.END, "✅ Aucune facture en retard\n")
        
        self.dashboard_text.insert(tk.END, "\n═══ PROCHAINES ACTIVITÉS ═══\n\n")
        if self.activites_enfants:
            for activite in self.activites_enfants[:3]:
                self.dashboard_text.insert(tk.END, 
                    f"• {activite['nom']} - {activite['activite']} ({activite['date']})\n")
        else:
            self.dashboard_text.insert(tk.END, "Aucune activité programmée\n")
        
        self.dashboard_text.insert(tk.END, "\n═══ PROCHAINS ENGAGEMENTS ═══\n\n")
        if self.engagements:
            for engagement in self.engagements[:3]:
                self.dashboard_text.insert(tk.END, 
                    f"• {engagement['titre']} avec {engagement['avec']} ({engagement['date']})\n")
        else:
            self.dashboard_text.insert(tk.END, "Aucun engagement programmé\n")
        
        self.dashboard_text.insert(tk.END, "\n" + "═"*50 + "\n")
        self.dashboard_text.insert(tk.END, "✨ Bonne organisation ! ✨\n")

def main():
    root = tk.Tk()
    app = AssistantFamilial(root)
    root.mainloop()

if __name__ == "__main__":
    main()
