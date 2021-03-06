import * as Bookshelf from 'bookshelf';
import * as _ from 'lodash';
import { inject, named } from 'inversify';
import { Logger as LoggerType } from '../../core/Logger';
import { Types, Core, Targets } from '../../constants';
import { validate, request } from '../../core/api/Validate';
import { NotFoundException } from '../exceptions/NotFoundException';
import { MessageException } from '../exceptions/MessageException';
import { EscrowRepository } from '../repositories/EscrowRepository';
import { Escrow } from '../models/Escrow';
import { EscrowCreateRequest } from '../requests/EscrowCreateRequest';
import { EscrowUpdateRequest } from '../requests/EscrowUpdateRequest';
import { EscrowReleaseRequest } from '../requests/EscrowReleaseRequest';
import { EscrowRefundRequest } from '../requests/EscrowRefundRequest';
import { EscrowLockRequest } from '../requests/EscrowLockRequest';
import { ListingItemTemplateRepository } from '../repositories/ListingItemTemplateRepository';
import { PaymentInformationRepository } from '../repositories/PaymentInformationRepository';
import { EscrowRatioService } from '../services/EscrowRatioService';
import { AddressService } from '../services/AddressService';
import { MessageBroadcastService } from '../services/MessageBroadcastService';
import { EscrowFactory } from '../factories/EscrowFactory';
import { EscrowMessageInterface } from '../messages/EscrowMessageInterface';
import { EscrowMessage } from '../messages/EscrowMessage';

export class EscrowService {

    public log: LoggerType;

    constructor(
        @inject(Types.Service) @named(Targets.Service.EscrowRatioService) private escrowratioService: EscrowRatioService,
        @inject(Types.Repository) @named(Targets.Repository.EscrowRepository) public escrowRepo: EscrowRepository,
        @inject(Types.Repository) @named(Targets.Repository.ListingItemTemplateRepository) public listingItemTemplateRepo: ListingItemTemplateRepository,
        @inject(Types.Repository) @named(Targets.Repository.PaymentInformationRepository) private paymentInfoRepo: PaymentInformationRepository,
        @inject(Types.Service) @named(Targets.Service.AddressService) private addressService: AddressService,
        @inject(Types.Factory) @named(Targets.Factory.EscrowFactory) private escrowFactory: EscrowFactory,
        @inject(Types.Service) @named(Targets.Service.MessageBroadcastService) private messageBroadcastService: MessageBroadcastService,
        @inject(Types.Core) @named(Core.Logger) public Logger: typeof LoggerType
    ) {
        this.log = new Logger(__filename);
    }

    public async findAll(): Promise<Bookshelf.Collection<Escrow>> {
        return this.escrowRepo.findAll();
    }

    public async findOne(id: number, withRelated: boolean = true): Promise<Escrow> {
        const escrow = await this.escrowRepo.findOne(id, withRelated);
        if (escrow === null) {
            this.log.warn(`Escrow with the id=${id} was not found!`);
            throw new NotFoundException(id);
        }
        return escrow;
    }

    public async findOneByPaymentInformation(id: number, withRelated: boolean = true): Promise<Escrow> {
        const escrow = await this.escrowRepo.findOneByPaymentInformation(id, withRelated);
        if (escrow === null) {
            this.log.warn(`Escrow with the id=${id} was not found!`);
            throw new NotFoundException(id);
        }
        return escrow;
    }

    public async createCheckByListingItem(body: any): Promise<Escrow> {
        // check listingItem by listingItemTemplateId
        const listingItemTemplateId = body.listingItemTemplateId;
        const listingItemTemplate = await this.listingItemTemplateRepo.findOne(listingItemTemplateId);
        if (listingItemTemplate.ListingItem.length === 0) {
            // creates an Escrow related to PaymentInformation related to ListingItemTemplate
            const paymentInformation = await this.paymentInfoRepo.findOneByListingItemTemplateId(listingItemTemplateId);
            if (paymentInformation === null) {
                this.log.warn(`PaymentInformation with the listing_item_template_id=${listingItemTemplateId} was not found!`);
                throw new MessageException(`PaymentInformation with the listing_item_template_id=${listingItemTemplateId} was not found!`);
            }
            body.payment_information_id = paymentInformation.Id;
        } else {
            this.log.warn(`Escrow cannot be created becuase Listing
            Item has allready been posted with listing-item-template-id ${listingItemTemplateId}`);
            throw new MessageException(`Escrow cannot be created becuase Listing
            Item has allready been posted with listing-item-template-id ${listingItemTemplateId}`);
        }
        delete body.listingItemTemplateId;
        return this.create(body);
    }

    @validate()
    public async create( @request(EscrowCreateRequest) data: EscrowCreateRequest): Promise<Escrow> {

        const body = JSON.parse(JSON.stringify(data));

        const escrowRatio = body.ratio;
        delete body.ratio;

        // If the request body was valid we will create the escrow
        const escrow = await this.escrowRepo.create(body);

        // create related models, escrowRatio
        if (!_.isEmpty(escrowRatio)) {
            escrowRatio.escrow_id = escrow.Id;
            await this.escrowratioService.create(escrowRatio);
        }

        // finally find and return the created escrow
        return await this.findOne(escrow.Id);
    }

    public async updateCheckByListingItem(body: any): Promise<Escrow> {
        // check listingItem by listingItemTemplateId
        const listingItemTemplateId = body.listingItemTemplateId;
        const listingItemTemplate = await this.listingItemTemplateRepo.findOne(listingItemTemplateId);
        let escrowId;
        if (listingItemTemplate.ListingItem.length === 0) {
            // creates an Escrow related to PaymentInformation related to ListingItemTemplate
            const paymentInformation = await this.paymentInfoRepo.findOneByListingItemTemplateId(listingItemTemplateId);
            if (paymentInformation === null) {
                this.log.warn(`PaymentInformation with the listing_item_template_id=${listingItemTemplateId} was not found!`);
                throw new MessageException(`PaymentInformation with the listing_item_template_id=${listingItemTemplateId} was not found!`);
            }
            const escrow = await this.findOneByPaymentInformation(paymentInformation.Id, false);
            escrowId = escrow.Id;
            body.payment_information_id = paymentInformation.Id;
        } else {
            this.log.warn(`Escrow cannot be updated becuase Listing
            Item has allready been posted with listing-item-template-id ${listingItemTemplateId}`);
            throw new MessageException(`Escrow cannot be updated becuase Listing
            Item has allready been posted with listing-item-template-id ${listingItemTemplateId}`);
        }
        delete body.listingItemTemplateId;
        return this.update(escrowId, body);
    }

    @validate()
    public async update(id: number, @request(EscrowUpdateRequest) data: EscrowUpdateRequest): Promise<Escrow> {

        const body = JSON.parse(JSON.stringify(data));

        // find the existing one without related
        const escrow = await this.findOne(id, false);

        // set new values
        escrow.Type = body.type;

        // update escrow record
        const updatedEscrow = await this.escrowRepo.update(id, escrow.toJSON());

        // find related escrowratio
        let relatedRatio = updatedEscrow.related('Ratio').toJSON();

        // delete it
        await this.escrowratioService.destroy(relatedRatio.id);

        // and create new related data
        relatedRatio = body.ratio;
        relatedRatio.escrow_id = id;
        await this.escrowratioService.create(relatedRatio);

        // finally find and return the updated escrow
        const newEscrow = await this.findOne(id);
        return newEscrow;
    }

    public async destroyCheckByListingItem(listingItemTemplateId: any): Promise<void> {
        // check listingItem by listingItemTemplateId
        const listingItemTemplate = await this.listingItemTemplateRepo.findOne(listingItemTemplateId);
        let escrowId;
        if (listingItemTemplate.ListingItem.length === 0) {
            // creates an Escrow related to PaymentInformation related to ListingItemTemplate
            const paymentInformation = await this.paymentInfoRepo.findOneByListingItemTemplateId(listingItemTemplateId);
            if (paymentInformation === null) {
                this.log.warn(`PaymentInformation with the listing_item_template_id=${listingItemTemplateId} was not found!`);
                throw new MessageException(`PaymentInformation with the listing_item_template_id=${listingItemTemplateId} was not found!`);
            }
            const escrow = await this.findOneByPaymentInformation(paymentInformation.Id, false);
            escrowId = escrow.Id;
        } else {
            this.log.warn(`Escrow cannot be updated becuase Listing
            Item has allready been posted with listing-item-template-id ${listingItemTemplateId}`);
            throw new MessageException(`Escrow cannot be updated becuase Listing
            Item has allready been posted with listing-item-template-id ${listingItemTemplateId}`);
        }
        return this.destroy(escrowId);
    }

    public async destroy(id: number): Promise<void> {
        await this.escrowRepo.destroy(id);
    }

    @validate()
    public async lock(@request(EscrowLockRequest) escrowRequest: EscrowLockRequest, escrow: Escrow): Promise<void> {

        // NOTE: We need to change as any from here to may be Escrow like that, currently I added it as any here because here
        // resources.Escrow module not able to include here.

        const escrowModel: any = escrow;

        // fetch the address
        const addressModel = await this.addressService.findOne(escrowRequest.addressId, false);
        const address = addressModel.toJSON();

        if (_.isEmpty(escrowModel) || _.isEmpty(address)) {
            throw new MessageException('Escrow or Address not found!');
        }

        // use escrowfactory to generate the lock message
        const escrowActionMessage = await this.escrowFactory.getMessage(escrowRequest, escrowModel, address);
        return await this.messageBroadcastService.broadcast(escrowActionMessage);
    }

    @validate()
    public async refund(@request(EscrowRefundRequest) escrowRequest: EscrowRefundRequest, escrow: Escrow): Promise<void> {

        // NOTE: We need to change as any from here to may be Escrow like that, currently I added it as any here because here
        // resources.Escrow module not able to include here.

        const escrowModel: any = escrow;

        // use escrowfactory to generate the refund message
        const escrowActionMessage = await this.escrowFactory.getMessage(escrowRequest, escrowModel);
        return await this.messageBroadcastService.broadcast(escrowActionMessage);
    }

    @validate()
    public async release(@request(EscrowReleaseRequest) escrowRequest: EscrowReleaseRequest, escrow: Escrow): Promise<void> {

        // NOTE: We need to change as any from here to may be Escrow like that, currently I added it as any here because here
        // resources.Escrow module not able to include here.

        const escrowModel: any = escrow;

        // use escrowfactory to generate the release message
        const escrowActionMessage = await this.escrowFactory.getMessage(escrowRequest, escrowModel);
        return await this.messageBroadcastService.broadcast(escrowActionMessage);
    }

}
