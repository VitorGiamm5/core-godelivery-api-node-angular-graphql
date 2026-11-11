import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

type Motorcycle = { id: string; plate: string; yearManufacture: number; modelName: string };
type Model = { id: string; name: string };
type Deliverier = { id: string; fullName: string; cnpj: string; birthDate: string; licenseNumber: string; licenseType: string; hasLicenseFile: boolean };
type Plan = { id: string; name: string; days: number; dailyCost: number };
type Rental = { id: string; deliverierId: string; motorcycleId: string; planId: string; startDate: string; estimatedReturnDate: string; returnedToBaseDate?: string };

@Component({
  imports: [FormsModule],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App implements OnInit {
  readonly view = signal('motorcycles');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly motorcycles = signal<Motorcycle[]>([]);
  readonly models = signal<Model[]>([]);
  readonly deliveriers = signal<Deliverier[]>([]);
  readonly plans = signal<Plan[]>([]);
  readonly rentals = signal<Rental[]>([]);
  readonly returnResult = signal('');

  motorcycleForm = { plate: '', yearManufacture: new Date().getFullYear(), modelName: '' };
  deliverierForm = { fullName: '', cnpj: '', birthDate: '', licenseNumber: '', licenseType: 'A', issueDate: '', expiryDate: '' };
  rentalForm = { deliverierId: '', motorcycleId: '', planId: '', startDate: '' };
  userForm = { name: '', email: '', password: '' };

  constructor(readonly auth: AuthService, private readonly api: ApiService) {}

  async ngOnInit() {
    try {
      if (location.pathname === '/callback') await this.auth.completeLogin();
      if (this.auth.authenticated()) await this.refresh();
    } catch (error) { this.showError(error); }
  }

  private showError(error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro inesperado';
    this.error.set(message === 'Failed to fetch' ? 'Servidor indisponível; tente novamente' : message);
  }
  async login() {
    this.error.set('');
    try { await this.auth.login(); }
    catch (error) { this.showError(error); }
  }
  async logout() {
    this.error.set('');
    try { await this.auth.logout(); }
    catch (error) { this.showError(error); }
  }
  private async run(action: () => Promise<unknown>, message: string) {
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try { await action(); this.notice.set(message); await this.refresh(); }
    catch (error) { this.showError(error); }
    finally { this.busy.set(false); }
  }

  async refresh() {
    const [motorcycles, models, deliveriers, plans, rentals] = await Promise.all([
      this.api.graphql<{ motorcycles: Motorcycle[] }>('query { motorcycles { id plate yearManufacture modelName } }'),
      this.api.graphql<{ motorcycleModels: Model[] }>('query { motorcycleModels { id name } }'),
      this.api.graphql<{ deliveriers: Deliverier[] }>('query { deliveriers { id fullName cnpj birthDate licenseNumber licenseType hasLicenseFile } }'),
      this.api.graphql<{ rentalPlans: Plan[] }>('query { rentalPlans { id name days dailyCost } }'),
      this.api.graphql<{ rentals: Rental[] }>('query { rentals { id deliverierId motorcycleId planId startDate estimatedReturnDate returnedToBaseDate } }'),
    ]);
    this.motorcycles.set(motorcycles.motorcycles);
    this.models.set(models.motorcycleModels);
    this.deliveriers.set(deliveriers.deliveriers);
    this.plans.set(plans.rentalPlans);
    this.rentals.set(rentals.rentals);
  }

  async createMotorcycle() {
    await this.run(() => this.api.graphql('mutation($input: CreateMotorcycleInput!) { createMotorcycle(input: $input) { id } }', { input: this.motorcycleForm }), 'Motocicleta criada');
  }
  async changePlate(id: string) {
    const plate = prompt('Nova placa'); if (!plate) return;
    await this.run(() => this.api.graphql('mutation($id: String!, $plate: String!) { changeMotorcyclePlate(id: $id, plate: $plate) { id } }', { id, plate }), 'Placa alterada');
  }
  async deleteMotorcycle(id: string) {
    if (!confirm('Excluir esta motocicleta?')) return;
    await this.run(() => this.api.graphql('mutation($id: String!) { deleteMotorcycle(id: $id) }', { id }), 'Motocicleta excluída');
  }
  async createDeliverier() {
    const input = { ...this.deliverierForm, birthDate: new Date(this.deliverierForm.birthDate).toISOString(), issueDate: new Date(this.deliverierForm.issueDate).toISOString(), expiryDate: new Date(this.deliverierForm.expiryDate).toISOString() };
    await this.run(() => this.api.graphql('mutation($input: CreateDeliverierInput!) { createDeliverier(input: $input) { id } }', { input }), 'Entregador criado');
  }
  async uploadLicense(id: string, event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
    await this.run(() => this.api.uploadLicense(id, file), 'Imagem de CNH enviada');
  }
  async downloadLicense(id: string) {
    try { await this.api.downloadLicense(id); } catch (error) { this.showError(error); }
  }
  async createRental() {
    const input = { ...this.rentalForm, startDate: this.rentalForm.startDate ? new Date(this.rentalForm.startDate).toISOString() : null };
    await this.run(() => this.api.graphql('mutation($input: CreateRentalInput!) { createRental(input: $input) { id } }', { input }), 'Locação criada');
  }
  async returnRental(id: string) {
    const date = prompt('Data da devolução (ISO 8601)', new Date().toISOString()); if (!date) return;
    await this.run(async () => {
      const result = await this.api.graphql<{ returnRental: { message: string; value: number; rentalAmount: number; totalCharge: number } }>('mutation($id: String!, $date: DateTime!) { returnRental(id: $id, returnedToBaseDate: $date) { message value rentalAmount totalCharge } }', { id, date });
      this.returnResult.set(`${result.returnRental.message} · Total R$ ${result.returnRental.totalCharge.toFixed(2)}`);
    }, 'Devolução registrada');
  }
  async createUser() {
    await this.run(() => this.api.graphql('mutation($name: String!, $email: String!, $password: String!) { createUser(name: $name, email: $email, password: $password) { id } }', this.userForm), 'Conta criada');
  }
}
